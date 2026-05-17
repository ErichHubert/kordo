import { describe, expect, it } from "vitest";

import { RunnerJobResultSchema, type ArtifactRef, type RunRequest } from "@kordo/contracts";

import { cleanupExpiredArtifacts } from "./artifact-cleanup.js";
import { createInMemoryArtifactStore } from "./in-memory-artifact-store.js";
import { createInMemoryRunRepository } from "../repositories/in-memory-run-repository.js";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    title: "Verify artifact cleanup",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

describe("cleanupExpiredArtifacts", () => {
  it("deletes expired artifact content for terminal runs", async () => {
    const repository = createInMemoryRunRepository();
    const artifactStore = createInMemoryArtifactStore();
    const { run } = await repository.createRun(runRequest);
    await repository.markRunRunning(run.id, "job_123");
    const artifact = await artifactStore.writeArtifact({
      runId: run.id,
      kind: "log",
      name: "stdout.log",
      content: "old log",
      contentType: "text/plain; charset=utf-8",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    await repository.finishRunFromRunnerResult(createRunnerJobResult(run.id, artifact));

    const summary = await cleanupExpiredArtifacts({
      artifactStore,
      batchSize: 100,
      now: new Date("2026-05-17T00:00:00.000Z"),
      repository,
      retentionDays: 7,
    });

    expect(summary).toMatchObject({
      deletedArtifacts: 1,
      expiredArtifacts: 1,
      failedArtifacts: 0,
      missingArtifacts: 0,
      scannedRuns: 1,
    });
    expect(await artifactStore.readArtifact(run.id, artifact)).toBeNull();
  });

  it("keeps artifact content that is still inside the retention period", async () => {
    const repository = createInMemoryRunRepository();
    const artifactStore = createInMemoryArtifactStore();
    const { run } = await repository.createRun(runRequest);
    await repository.markRunRunning(run.id, "job_123");
    const artifact = await artifactStore.writeArtifact({
      runId: run.id,
      kind: "log",
      name: "stdout.log",
      content: "fresh log",
      contentType: "text/plain; charset=utf-8",
      createdAt: new Date("2026-05-16T00:00:00.000Z"),
    });
    await repository.finishRunFromRunnerResult(createRunnerJobResult(run.id, artifact));

    const summary = await cleanupExpiredArtifacts({
      artifactStore,
      batchSize: 100,
      now: new Date("2026-05-17T00:00:00.000Z"),
      repository,
      retentionDays: 7,
    });

    expect(summary).toMatchObject({
      deletedArtifacts: 0,
      expiredArtifacts: 0,
      scannedRuns: 0,
    });
    expect(await artifactStore.readArtifact(run.id, artifact)).not.toBeNull();
  });

  it("counts already-missing artifact content without failing the cleanup", async () => {
    const repository = createInMemoryRunRepository();
    const artifactStore = createInMemoryArtifactStore();
    const { run } = await repository.createRun(runRequest);
    await repository.markRunRunning(run.id, "job_123");
    const artifact = await artifactStore.writeArtifact({
      runId: run.id,
      kind: "log",
      name: "stdout.log",
      content: "old log",
      contentType: "text/plain; charset=utf-8",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    await artifactStore.deleteArtifact(run.id, artifact);
    await repository.finishRunFromRunnerResult(createRunnerJobResult(run.id, artifact));

    const summary = await cleanupExpiredArtifacts({
      artifactStore,
      batchSize: 100,
      now: new Date("2026-05-17T00:00:00.000Z"),
      repository,
      retentionDays: 7,
    });

    expect(summary).toMatchObject({
      deletedArtifacts: 0,
      expiredArtifacts: 1,
      failedArtifacts: 0,
      missingArtifacts: 1,
      scannedRuns: 1,
    });
  });
});

function createRunnerJobResult(runId: string, artifact: ArtifactRef) {
  const now = "2026-05-14T20:00:00.000Z";

  return RunnerJobResultSchema.parse({
    id: "job_123",
    runId,
    status: "completed",
    startedAt: now,
    completedAt: now,
    execution: {
      containerName: "kordo-job_123",
      command: ["node", "--version"],
      exitCode: 0,
      stdout: "",
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
      runId,
      generatedAt: now,
      artifacts: [artifact],
    },
    summary: "Runner completed.",
  });
}
