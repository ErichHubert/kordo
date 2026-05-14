import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  PhaseEventSchema,
  RunnerJobResultSchema,
  RunStateSchema,
  type RunRequest,
  type RunnerJob,
} from "@kordo/contracts";

import { buildApp } from "./app.js";
import { createInMemoryRunRepository } from "./repositories/in-memory-run-repository.js";
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

  it("creates and completes a run through the runner client", async () => {
    app = buildApp({
      repository: createInMemoryRunRepository(),
      runnerClient: createCompletingRunnerClient(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });

    expect(response.statusCode).toBe(201);

    const run = RunStateSchema.parse(response.json());

    expect(run.id).toMatch(/^run_/);
    expect(run.workflowId).toBe(runRequest.workflowId);
    expect(run.status).toBe("completed");
    expect(run.currentPhase).toBeNull();
    expect(run.runnerJobId).toMatch(/^job_/);
    expect(run.artifacts).toEqual([]);
  });

  it("reads a created run", async () => {
    app = buildApp({
      repository: createInMemoryRunRepository(),
      runnerClient: createCompletingRunnerClient(),
    });

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

  it("lists queued, running, and completed run events", async () => {
    app = buildApp({
      repository: createInMemoryRunRepository(),
      runnerClient: createCompletingRunnerClient(),
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/runs",
      payload: runRequest,
    });
    const createdRun = RunStateSchema.parse(createResponse.json());

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
    app = buildApp({
      repository: createInMemoryRunRepository(),
      runnerClient: createCompletingRunnerClient(),
    });

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
    app = buildApp({
      repository: createInMemoryRunRepository(),
      runnerClient: createCompletingRunnerClient(),
    });

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

function createCompletingRunnerClient(): RunnerClient {
  return {
    async runJob(job: RunnerJob) {
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
    },
  };
}
