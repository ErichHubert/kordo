import type { ArtifactStore } from "./artifact-store.js";
import type { RunRepository } from "../repositories/run-repository.js";

export interface ArtifactCleanupOptions {
  artifactStore: ArtifactStore;
  batchSize: number;
  now?: Date;
  repository: RunRepository;
  retentionDays: number;
}

export interface ArtifactCleanupFailure {
  artifactId: string;
  message: string;
  runId: string;
}

export interface ArtifactCleanupSummary {
  deletedArtifacts: number;
  expiredArtifacts: number;
  expiresBefore: string;
  failedArtifacts: number;
  failures: ArtifactCleanupFailure[];
  missingArtifacts: number;
  scannedRuns: number;
}

export async function cleanupExpiredArtifacts(
  options: ArtifactCleanupOptions,
): Promise<ArtifactCleanupSummary> {
  assertPositiveInteger("retentionDays", options.retentionDays);
  assertPositiveInteger("batchSize", options.batchSize);

  const now = options.now ?? new Date();
  const expiresBefore = new Date(now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000);
  const candidates = await options.repository.listArtifactCleanupCandidates({
    expiresBefore,
    limit: options.batchSize,
  });
  const summary: ArtifactCleanupSummary = {
    deletedArtifacts: 0,
    expiredArtifacts: candidates.reduce((sum, candidate) => sum + candidate.artifacts.length, 0),
    expiresBefore: expiresBefore.toISOString(),
    failedArtifacts: 0,
    failures: [],
    missingArtifacts: 0,
    scannedRuns: candidates.length,
  };

  for (const candidate of candidates) {
    for (const artifact of candidate.artifacts) {
      try {
        const result = await options.artifactStore.deleteArtifact(candidate.runId, artifact);

        if (result.status === "deleted") {
          summary.deletedArtifacts += 1;
        } else {
          summary.missingArtifacts += 1;
        }
      } catch (error) {
        summary.failedArtifacts += 1;
        summary.failures.push({
          artifactId: artifact.id,
          message: error instanceof Error ? error.message : "Artifact deletion failed.",
          runId: candidate.runId,
        });
      }
    }
  }

  return summary;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}
