import { describe, expect, it } from "vitest";

import { RunnerJobResultSchema, type RunnerJobResult } from "@kordo/contracts";

import { ArtifactLimitExceededError } from "./artifact-limits.js";
import { createInMemoryArtifactStore } from "./in-memory-artifact-store.js";
import { materializeRunnerResultArtifacts } from "./result-artifacts.js";

describe("materializeRunnerResultArtifacts", () => {
  it("truncates stdout and stderr log artifacts at the per-artifact limit", async () => {
    const artifactStore = createInMemoryArtifactStore();
    const result = await materializeRunnerResultArtifacts(createRunnerJobResult(), artifactStore, {
      limits: {
        maxArtifactBytes: 4,
        maxRunArtifactBytes: 20,
      },
    });
    const stdoutArtifact = result.artifactManifest.artifacts.find(
      (artifact) => artifact.name === "stdout.log",
    );

    expect(result.execution.stdout).toBe("abcd");
    expect(stdoutArtifact).toMatchObject({
      name: "stdout.log",
      originalSizeBytes: 6,
      sizeBytes: 4,
      truncated: true,
    });
    expect(
      stdoutArtifact
        ? (await artifactStore.readArtifact(result.runId, stdoutArtifact))?.content.toString("utf8")
        : undefined,
    ).toBe("abcd");
  });

  it("fails when the materialized logs would exceed the per-run limit", async () => {
    const artifactStore = createInMemoryArtifactStore();

    await expect(
      materializeRunnerResultArtifacts(createRunnerJobResult(), artifactStore, {
        limits: {
          maxArtifactBytes: 10,
          maxRunArtifactBytes: 6,
        },
      }),
    ).rejects.toThrow(ArtifactLimitExceededError);
  });

  it("fails when existing artifact refs exceed the per-artifact limit", async () => {
    const artifactStore = createInMemoryArtifactStore();

    await expect(
      materializeRunnerResultArtifacts(
        createRunnerJobResult({
          artifactManifest: {
            runId: "run_123",
            generatedAt: "2026-05-14T20:00:00.000Z",
            artifacts: [
              {
                id: "artifact_large",
                kind: "report",
                name: "report.json",
                uri: "artifact://runs/run_123/report.json",
                sizeBytes: 11,
                createdAt: "2026-05-14T20:00:00.000Z",
              },
            ],
          },
        }),
        artifactStore,
        {
          limits: {
            maxArtifactBytes: 10,
            maxRunArtifactBytes: 100,
          },
        },
      ),
    ).rejects.toThrow(ArtifactLimitExceededError);
  });
});

function createRunnerJobResult(overrides: Partial<RunnerJobResult> = {}): RunnerJobResult {
  const now = "2026-05-14T20:00:00.000Z";

  return RunnerJobResultSchema.parse({
    id: "job_123",
    runId: "run_123",
    status: "completed",
    startedAt: now,
    completedAt: now,
    execution: {
      containerName: "kordo-job_123",
      command: ["node", "--version"],
      exitCode: 0,
      stdout: "abcdef",
      stderr: "xy",
      startedAt: now,
      completedAt: now,
      durationMs: 12,
      timedOut: false,
      cleanup: {
        removed: true,
      },
    },
    artifactManifest: {
      runId: "run_123",
      generatedAt: now,
      artifacts: [],
    },
    ...overrides,
  });
}
