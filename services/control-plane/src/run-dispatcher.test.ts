import { describe, expect, it } from "vitest";

import {
  RunResultSchema,
  RunStateSchema,
  RunnerJobResultSchema,
  type RunRequest,
  type RunnerJob,
  type RunnerJobResult,
} from "@kordo/contracts";

import { createInMemoryArtifactStore } from "./artifacts/in-memory-artifact-store.js";
import { createInMemoryRunRepository } from "./repositories/in-memory-run-repository.js";
import { createRunnerJob } from "./runner-jobs.js";
import { createInProcessRunDispatcher, type RunDispatcherLogger } from "./run-dispatcher.js";
import type { RunnerClient } from "./runner-client.js";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    title: "Verify dispatcher",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

describe("InProcessRunDispatcher", () => {
  it("marks a run running and stores the completed runner result", async () => {
    const repository = createInMemoryRunRepository();
    const { run } = await repository.createRun(runRequest);
    const job = createRunnerJob(run, runRequest);
    const dispatcher = createInProcessRunDispatcher({
      artifactStore: createInMemoryArtifactStore(),
      repository,
      runnerClient: createCompletingRunnerClient(),
    });

    dispatcher.dispatch(job);
    await dispatcher.waitForIdle?.();

    const completedRun = RunStateSchema.parse(await repository.getRun(run.id));
    const result = RunResultSchema.parse(await repository.getRunResult(run.id));
    const events = await repository.listRunEvents(run.id);

    expect(completedRun).toMatchObject({
      id: run.id,
      status: "completed",
      currentPhase: null,
      runnerJobId: job.id,
    });
    expect(result).toMatchObject({
      runId: run.id,
      runnerJobId: job.id,
      status: "completed",
      execution: {
        exitCode: 0,
      },
      artifactManifest: {
        artifacts: [
          {
            name: "stdout.log",
          },
          {
            name: "stderr.log",
          },
        ],
      },
    });
    expect(completedRun.artifacts.map((artifact) => artifact.name)).toEqual([
      "stdout.log",
      "stderr.log",
    ]);
    expect(events.map((event) => event.status)).toEqual(["completed", "started", "completed"]);
  });

  it("persists a failed run and logs structured context when runner dispatch fails", async () => {
    const repository = createInMemoryRunRepository();
    const logger = createCapturingLogger();
    const dispatchError = new Error("connect ECONNREFUSED 127.0.0.1:4200");
    const { run } = await repository.createRun(runRequest);
    const job = createRunnerJob(run, runRequest);
    const dispatcher = createInProcessRunDispatcher({
      artifactStore: createInMemoryArtifactStore(),
      logger,
      repository,
      runnerClient: createThrowingRunnerClient(dispatchError),
    });

    dispatcher.dispatch(job);
    await dispatcher.waitForIdle?.();

    const failedRun = RunStateSchema.parse(await repository.getRun(run.id));

    expect(failedRun).toMatchObject({
      id: run.id,
      status: "failed",
      currentPhase: null,
      runnerJobId: job.id,
      failureReason: {
        code: "RunnerDispatchFailed",
        message: dispatchError.message,
      },
    });
    expect(await repository.getRunResult(run.id)).toBeNull();
    expect(logger.errors).toHaveLength(1);
    expect(logger.errors[0]).toMatchObject({
      message: "Runner job failed before completion",
      payload: {
        error: dispatchError,
        runId: run.id,
        runnerJobId: job.id,
        workflowId: run.workflowId,
        failureReason: {
          code: "RunnerDispatchFailed",
          message: dispatchError.message,
        },
      },
    });
  });

  it("waits for in-flight dispatch before closing and rejects new dispatches after close", async () => {
    const repository = createInMemoryRunRepository();
    const deferredRunner = createDeferredRunnerClient();
    const { run } = await repository.createRun(runRequest);
    const job = createRunnerJob(run, runRequest);
    const dispatcher = createInProcessRunDispatcher({
      artifactStore: createInMemoryArtifactStore(),
      repository,
      runnerClient: deferredRunner.client,
    });

    dispatcher.dispatch(job);
    await deferredRunner.waitForJob();

    let closeResolved = false;
    const closePromise = dispatcher.close?.().then(() => {
      closeResolved = true;
    });

    await Promise.resolve();
    expect(closeResolved).toBe(false);

    deferredRunner.completeWith(createCompletedRunnerJobResult(job));
    await closePromise;

    expect(closeResolved).toBe(true);
    expect(() => dispatcher.dispatch(job)).toThrow("Run dispatcher is closed.");
    expect(RunStateSchema.parse(await repository.getRun(run.id)).status).toBe("completed");
  });
});

interface CapturingLogger extends RunDispatcherLogger {
  errors: Array<{
    message: string;
    payload: Record<string, unknown>;
  }>;
}

function createCapturingLogger(): CapturingLogger {
  const errors: CapturingLogger["errors"] = [];

  return {
    errors,
    error(payload, message) {
      errors.push({ payload, message });
    },
  };
}

function createCompletingRunnerClient(): RunnerClient {
  return {
    async runJob(job: RunnerJob) {
      return createCompletedRunnerJobResult(job);
    },
  };
}

function createThrowingRunnerClient(error: Error): RunnerClient {
  return {
    async runJob() {
      throw error;
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
