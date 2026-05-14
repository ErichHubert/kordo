import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { RunnerJobResultSchema, type RunnerJob } from "@kordo/contracts";

import { buildApp } from "./app.js";
import { createInMemoryRunnerJobRepository } from "./jobs.js";

const createdAt = "2026-05-14T16:00:00.000Z";

const runnerJob: RunnerJob = {
  id: "job_123",
  runId: "run_123",
  workflowId: "artifexarena.issue.fix",
  sandbox: {
    backend: "docker-local",
    profile: "docker-local-default",
    image: "node:24-alpine",
  },
  command: {
    argv: ["node", "--version"],
    timeoutMs: 30_000,
  },
  environmentPolicy: {
    allowNetwork: false,
    allowedEnv: [],
  },
  allowedGatewayRoutes: [],
  createdAt,
};

describe("runner job API", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it("accepts and completes a runner job", async () => {
    app = buildApp({
      repository: createInMemoryRunnerJobRepository(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: runnerJob,
    });

    expect(response.statusCode).toBe(201);

    const result = RunnerJobResultSchema.parse(response.json());

    expect(result).toMatchObject({
      id: runnerJob.id,
      runId: runnerJob.runId,
      status: "completed",
    });
    expect(result.artifactManifest.artifacts).toEqual([]);
  });

  it("reads a completed runner job", async () => {
    app = buildApp({
      repository: createInMemoryRunnerJobRepository(),
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: runnerJob,
    });
    const createdJob = RunnerJobResultSchema.parse(createResponse.json());

    const readResponse = await app.inject({
      method: "GET",
      url: `/jobs/${runnerJob.id}`,
    });

    expect(readResponse.statusCode).toBe(200);
    expect(RunnerJobResultSchema.parse(readResponse.json())).toEqual(createdJob);
  });

  it("rejects invalid runner jobs", async () => {
    app = buildApp({
      repository: createInMemoryRunnerJobRepository(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      payload: {
        ...runnerJob,
        command: {
          ...runnerJob.command,
          argv: [],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "InvalidRunnerJob",
    });
  });

  it("returns 404 for missing jobs", async () => {
    app = buildApp({
      repository: createInMemoryRunnerJobRepository(),
    });

    const response = await app.inject({
      method: "GET",
      url: "/jobs/job_missing",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "RunnerJobNotFound",
    });
  });
});
