import { describe, expect, it } from "vitest";

import {
  RunnerJobResultSchema,
  RunnerJobSchema,
  RunStateSchema,
  type RunnerJob,
  type RunnerJobResult,
} from "@kordo/contracts";

import { createInMemoryArtifactStore } from "../artifacts/in-memory-artifact-store.js";
import { createInMemoryRunRepository } from "../repositories/in-memory-run-repository.js";
import type { RunnerClient } from "../runner-client.js";
import { executeRunCreatedWorkflow } from "./workflows.js";

const runnerJob: RunnerJob = RunnerJobSchema.parse({
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
  createdAt: "2026-05-14T20:00:00.000Z",
});

describe("Hatchet workflow handlers", () => {
  it("executes a run-created job and finalizes the run", async () => {
    const repository = createInMemoryRunRepository();
    const artifactStore = createInMemoryArtifactStore();
    const created = await repository.createRun({
      workflowId: runnerJob.workflowId,
      input: {
        source: "manual",
        title: "Verify Hatchet workflow",
      },
      workspace: {
        kind: "git",
        repositoryUrl: "https://github.com/example/app.git",
        ref: "main",
      },
      sandboxProfile: "docker-local-default",
      allowedGatewayRoutes: [],
    });
    const job = {
      ...runnerJob,
      runId: created.run.id,
    };

    const result = await executeRunCreatedWorkflow(
      {
        job,
      },
      {
        artifactStore,
        repository,
        runnerClient: createCompletingRunnerClient(),
      },
    );

    expect(result).toEqual({
      runId: created.run.id,
      runnerJobId: job.id,
    });

    const run = RunStateSchema.parse(await repository.getRun(created.run.id));

    expect(run).toMatchObject({
      id: created.run.id,
      status: "completed",
      currentPhase: null,
      runnerJobId: job.id,
    });
    expect(run.artifacts.map((artifact) => artifact.name)).toEqual(["stdout.log", "stderr.log"]);
  });
});

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
