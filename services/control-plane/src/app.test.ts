import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  PhaseEventSchema,
  RunResultSchema,
  RunnerJobResultSchema,
  RunStateSchema,
  type RunRequest,
  type RunnerJob,
  type RunnerJobResult,
} from "@kordo/contracts";

import { buildApp } from "./app.js";
import { createInMemoryRunRepository } from "./repositories/in-memory-run-repository.js";
import type { RunRepository } from "./repositories/run-repository.js";
import { createInProcessRunDispatcher, type RunDispatcher } from "./run-dispatcher.js";
import type { RunnerClient } from "./runner-client.js";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    externalId: "issue-123",
    title: "Fix failing login test",
    body: "The login test fails against the local fixture.",
  },
  workspace: {
    kind: "git",
    repositoryUrl: "https://github.com/example/app.git",
    ref: "main",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

describe("control-plane run API", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("creates a queued run and completes it asynchronously", async () => {
    const deferredRunner = createDeferredRunnerClient();
    const testContext = createTestApp({ runnerClient: deferredRunner.client });
    app = testContext.app;

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });

    expect(response.statusCode).toBe(202);

    const queuedRun = RunStateSchema.parse(response.json());

    expect(queuedRun).toMatchObject({
      workflowId: runRequest.workflowId,
      status: "queued",
      currentPhase: "queued",
      runnerJobId: null,
      artifacts: [],
    });

    const runnerJob = await deferredRunner.waitForJob();
    const runningResponse = await app.inject({
      method: "GET",
      url: `/runs/${queuedRun.id}`,
    });
    const runningRun = RunStateSchema.parse(runningResponse.json());

    expect(runningRun).toMatchObject({
      id: queuedRun.id,
      status: "running",
      currentPhase: "runner",
      runnerJobId: runnerJob.id,
    });

    deferredRunner.completeWith(createCompletedRunnerJobResult(runnerJob));
    await testContext.dispatcher.waitForIdle?.();

    const completedResponse = await app.inject({
      method: "GET",
      url: `/runs/${queuedRun.id}`,
    });
    const completedRun = RunStateSchema.parse(completedResponse.json());

    expect(completedRun).toMatchObject({
      id: queuedRun.id,
      status: "completed",
      currentPhase: null,
      runnerJobId: runnerJob.id,
    });

    const resultResponse = await app.inject({
      method: "GET",
      url: `/runs/${queuedRun.id}/result`,
    });

    expect(resultResponse.statusCode).toBe(200);
    expect(RunResultSchema.parse(resultResponse.json())).toMatchObject({
      runId: queuedRun.id,
      runnerJobId: runnerJob.id,
      status: "completed",
      execution: {
        command: ["node", "--version"],
        exitCode: 0,
        stdout: "v24.12.0\n",
      },
    });
  });

  it("reads a queued run before dispatch starts", async () => {
    const testContext = createTestApp({ dispatcher: createNoopRunDispatcher() });
    app = testContext.app;

    const createResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });
    const createdRun = RunStateSchema.parse(createResponse.json());

    const readResponse = await app.inject({
      method: "GET",
      url: `/runs/${createdRun.id}`,
    });

    expect(readResponse.statusCode).toBe(200);
    expect(RunStateSchema.parse(readResponse.json())).toEqual(createdRun);
  });

  it("lists runs newest first", async () => {
    const testContext = createTestApp({ dispatcher: createNoopRunDispatcher() });
    app = testContext.app;

    const firstCreateResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        ...runRequest,
        input: {
          ...runRequest.input,
          title: "First run",
        },
      },
    });
    const firstRun = RunStateSchema.parse(firstCreateResponse.json());

    await waitForClockTick();

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        ...runRequest,
        input: {
          ...runRequest.input,
          title: "Second run",
        },
      },
    });
    const secondRun = RunStateSchema.parse(secondCreateResponse.json());

    const listResponse = await app.inject({
      method: "GET",
      url: "/runs",
    });

    expect(listResponse.statusCode).toBe(200);

    const runs = RunStateSchema.array().parse(listResponse.json());

    expect(runs.map((run) => run.id)).toEqual([secondRun.id, firstRun.id]);
  });

  it("filters listed runs by status and limit", async () => {
    const testContext = createTestApp();
    app = testContext.app;

    await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });
    await waitForClockTick();
    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });
    const secondRun = RunStateSchema.parse(secondCreateResponse.json());

    await testContext.dispatcher.waitForIdle?.();

    const listResponse = await app.inject({
      method: "GET",
      url: "/runs?status=completed&limit=1",
    });

    expect(listResponse.statusCode).toBe(200);

    const runs = RunStateSchema.array().parse(listResponse.json());

    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(secondRun.id);
    expect(runs[0]?.status).toBe("completed");
  });

  it("rejects invalid run list queries", async () => {
    const testContext = createTestApp({ dispatcher: createNoopRunDispatcher() });
    app = testContext.app;

    const response = await app.inject({
      method: "GET",
      url: "/runs?status=waiting&limit=0",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "InvalidRunListQuery",
    });
  });

  it("persists failed runner results and exposes the failed run result", async () => {
    const testContext = createTestApp({ runnerClient: createFailingRunnerClient() });
    app = testContext.app;

    const createResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });

    expect(createResponse.statusCode).toBe(202);

    const queuedRun = RunStateSchema.parse(createResponse.json());
    await testContext.dispatcher.waitForIdle?.();

    const runResponse = await app.inject({
      method: "GET",
      url: `/runs/${queuedRun.id}`,
    });
    const run = RunStateSchema.parse(runResponse.json());

    expect(run).toMatchObject({
      status: "failed",
      currentPhase: null,
      failureReason: {
        code: "SandboxCommandFailed",
        message: "Sandbox command exited with code 2.",
      },
    });

    const resultResponse = await app.inject({
      method: "GET",
      url: `/runs/${run.id}/result`,
    });

    expect(resultResponse.statusCode).toBe(200);

    const result = RunResultSchema.parse(resultResponse.json());

    expect(result).toMatchObject({
      runId: run.id,
      runnerJobId: run.runnerJobId,
      status: "failed",
      execution: {
        command: ["node", "--version"],
        exitCode: 2,
        stderr: "command failed\n",
        timedOut: false,
      },
      failureReason: {
        code: "SandboxCommandFailed",
      },
    });

    const eventsResponse = await app.inject({
      method: "GET",
      url: `/runs/${run.id}/events`,
    });
    const events = PhaseEventSchema.array().parse(eventsResponse.json());

    expect(events.map((event) => event.status)).toEqual(["completed", "started", "failed"]);
  });

  it("records runner dispatch failures in the background", async () => {
    const testContext = createTestApp({
      runnerClient: createThrowingRunnerClient(new Error("connect ECONNREFUSED 127.0.0.1:4200")),
    });
    app = testContext.app;

    const createResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });

    expect(createResponse.statusCode).toBe(202);

    const queuedRun = RunStateSchema.parse(createResponse.json());
    await testContext.dispatcher.waitForIdle?.();

    const runResponse = await app.inject({
      method: "GET",
      url: `/runs/${queuedRun.id}`,
    });
    const run = RunStateSchema.parse(runResponse.json());

    expect(run).toMatchObject({
      status: "failed",
      currentPhase: null,
      failureReason: {
        code: "RunnerDispatchFailed",
        message: "connect ECONNREFUSED 127.0.0.1:4200",
      },
    });

    const resultResponse = await app.inject({
      method: "GET",
      url: `/runs/${run.id}/result`,
    });

    expect(resultResponse.statusCode).toBe(404);
    expect(resultResponse.json()).toEqual({
      error: "RunResultNotFound",
    });

    const eventsResponse = await app.inject({
      method: "GET",
      url: `/runs/${run.id}/events`,
    });
    const events = PhaseEventSchema.array().parse(eventsResponse.json());

    expect(events.map((event) => event.status)).toEqual(["completed", "started", "failed"]);
    expect(events[2]?.message).toBe("Runner job failed before completion.");
  });

  it("lists queued, running, and completed run events", async () => {
    const testContext = createTestApp();
    app = testContext.app;

    const createResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });
    const createdRun = RunStateSchema.parse(createResponse.json());

    await testContext.dispatcher.waitForIdle?.();

    const eventsResponse = await app.inject({
      method: "GET",
      url: `/runs/${createdRun.id}/events`,
    });

    expect(eventsResponse.statusCode).toBe(200);

    const events = PhaseEventSchema.array().parse(eventsResponse.json());

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      runId: createdRun.id,
      phase: "queued",
      status: "completed",
      artifactIds: [],
    });
    expect(events[1]).toMatchObject({
      runId: createdRun.id,
      phase: "runner",
      status: "started",
      artifactIds: [],
    });
    expect(events[2]).toMatchObject({
      runId: createdRun.id,
      phase: "runner",
      status: "completed",
      artifactIds: [],
    });
  });

  it("rejects invalid run requests", async () => {
    const testContext = createTestApp({ dispatcher: createNoopRunDispatcher() });
    app = testContext.app;

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: {
        ...runRequest,
        workflowId: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "InvalidRunRequest",
    });
  });

  it("returns 404 for missing runs", async () => {
    const testContext = createTestApp({ dispatcher: createNoopRunDispatcher() });
    app = testContext.app;

    const response = await app.inject({
      method: "GET",
      url: "/runs/run_missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "RunNotFound",
    });
  });
});

interface TestAppContext {
  app: FastifyInstance;
  dispatcher: RunDispatcher;
  repository: RunRepository;
}

function createTestApp(
  options: { dispatcher?: RunDispatcher; runnerClient?: RunnerClient } = {},
): TestAppContext {
  const repository = createInMemoryRunRepository();
  const dispatcher =
    options.dispatcher ??
    createInProcessRunDispatcher({
      repository,
      runnerClient: options.runnerClient ?? createCompletingRunnerClient(),
    });

  return {
    app: buildApp({
      dispatcher,
      repository,
    }),
    dispatcher,
    repository,
  };
}

function createNoopRunDispatcher(): RunDispatcher {
  return {
    dispatch() {},
  };
}

function createCompletingRunnerClient(): RunnerClient {
  return {
    async runJob(job: RunnerJob) {
      return createCompletedRunnerJobResult(job);
    },
  };
}

function createCompletedRunnerJobResult(job: RunnerJob): RunnerJobResult {
  const now = new Date().toISOString();

  return RunnerJobResultSchema.parse({
    id: job.id,
    runId: job.runId,
    status: "completed",
    startedAt: now,
    completedAt: now,
    execution: {
      containerName: `kordo-${job.id}`,
      command: job.command.argv,
      exitCode: 0,
      stdout: "v24.12.0\n",
      stderr: "",
      startedAt: now,
      completedAt: now,
      durationMs: 12,
      timedOut: false,
      cleanup: {
        removed: true,
      },
    },
    artifactManifest: {
      runId: job.runId,
      generatedAt: now,
      artifacts: [],
      summary: "Runner stub completed without sandbox execution.",
    },
    summary: "Runner stub completed without sandbox execution.",
  });
}

function createFailingRunnerClient(): RunnerClient {
  return {
    async runJob(job: RunnerJob) {
      return createFailedRunnerJobResult(job);
    },
  };
}

function createFailedRunnerJobResult(job: RunnerJob): RunnerJobResult {
  const now = new Date().toISOString();

  return RunnerJobResultSchema.parse({
    id: job.id,
    runId: job.runId,
    status: "failed",
    startedAt: now,
    completedAt: now,
    execution: {
      containerName: `kordo-${job.id}`,
      command: job.command.argv,
      exitCode: 2,
      stdout: "",
      stderr: "command failed\n",
      startedAt: now,
      completedAt: now,
      durationMs: 12,
      timedOut: false,
      cleanup: {
        removed: true,
      },
    },
    artifactManifest: {
      runId: job.runId,
      generatedAt: now,
      artifacts: [],
      summary: "Docker-local sandbox command failed.",
    },
    summary: "Docker-local sandbox command failed.",
    failureReason: {
      code: "SandboxCommandFailed",
      message: "Sandbox command exited with code 2.",
    },
  });
}

function createThrowingRunnerClient(error: Error): RunnerClient {
  return {
    async runJob() {
      throw error;
    },
  };
}

interface DeferredRunnerClient {
  client: RunnerClient;
  completeWith(result: RunnerJobResult): void;
  waitForJob(): Promise<RunnerJob>;
}

function createDeferredRunnerClient(): DeferredRunnerClient {
  let completeWithResult: ((result: RunnerJobResult) => void) | null = null;
  let startedJob: RunnerJob | null = null;
  let resolveStartedJob: ((job: RunnerJob) => void) | null = null;

  const startedJobPromise = new Promise<RunnerJob>((resolve) => {
    resolveStartedJob = resolve;
  });
  const resultPromise = new Promise<RunnerJobResult>((resolve) => {
    completeWithResult = resolve;
  });

  return {
    client: {
      async runJob(job: RunnerJob) {
        startedJob = job;
        resolveStartedJob?.(job);
        return resultPromise;
      },
    },
    completeWith(result: RunnerJobResult) {
      completeWithResult?.(result);
    },
    async waitForJob() {
      return startedJob ?? startedJobPromise;
    },
  };
}

async function waitForClockTick(): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() === startedAt) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
