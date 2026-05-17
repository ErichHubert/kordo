import { RunnerJobResultSchema, type RunnerJobResult } from "@kordo/contracts";

import type { ArtifactStore } from "./artifact-store.js";
import {
  ArtifactLimitExceededError,
  normalizeArtifactLimits,
  type ArtifactLimits,
} from "./artifact-limits.js";

export interface MaterializeRunnerResultArtifactsOptions {
  limits?: Partial<ArtifactLimits>;
}

export async function materializeRunnerResultArtifacts(
  result: RunnerJobResult,
  artifactStore: ArtifactStore,
  options: MaterializeRunnerResultArtifactsOptions = {},
): Promise<RunnerJobResult> {
  const limits = normalizeArtifactLimits(options.limits);
  const createdAt = new Date(result.completedAt);
  const existingArtifactBytes = sumArtifactBytes(result, limits);
  const stdoutLog = createLimitedLog(result.execution.stdout, limits.maxArtifactBytes);
  const stderrLog = createLimitedLog(result.execution.stderr, limits.maxArtifactBytes);
  const totalBytes =
    existingArtifactBytes + stdoutLog.content.byteLength + stderrLog.content.byteLength;

  if (totalBytes > limits.maxRunArtifactBytes) {
    throw new ArtifactLimitExceededError(
      `Runner result artifacts require ${totalBytes} bytes, exceeding the per-run limit of ${limits.maxRunArtifactBytes} bytes.`,
    );
  }

  const stdoutArtifact = await artifactStore.writeArtifact({
    runId: result.runId,
    kind: "log",
    name: "stdout.log",
    content: stdoutLog.content,
    contentType: "text/plain; charset=utf-8",
    createdAt,
    ...(stdoutLog.originalSizeBytes !== undefined
      ? { originalSizeBytes: stdoutLog.originalSizeBytes }
      : {}),
    ...(stdoutLog.truncated ? { truncated: stdoutLog.truncated } : {}),
  });
  const stderrArtifact = await artifactStore.writeArtifact({
    runId: result.runId,
    kind: "log",
    name: "stderr.log",
    content: stderrLog.content,
    contentType: "text/plain; charset=utf-8",
    createdAt,
    ...(stderrLog.originalSizeBytes !== undefined
      ? { originalSizeBytes: stderrLog.originalSizeBytes }
      : {}),
    ...(stderrLog.truncated ? { truncated: stderrLog.truncated } : {}),
  });

  return RunnerJobResultSchema.parse({
    ...result,
    execution: {
      ...result.execution,
      stdout: stdoutLog.content.toString("utf8"),
      stderr: stderrLog.content.toString("utf8"),
    },
    artifactManifest: {
      ...result.artifactManifest,
      artifacts: [...result.artifactManifest.artifacts, stdoutArtifact, stderrArtifact],
    },
  });
}

interface LimitedLog {
  content: Buffer;
  originalSizeBytes?: number;
  truncated?: true;
}

function createLimitedLog(content: string, maxArtifactBytes: number): LimitedLog {
  const originalContent = Buffer.from(content, "utf8");

  if (originalContent.byteLength <= maxArtifactBytes) {
    return {
      content: originalContent,
    };
  }

  return {
    content: originalContent.subarray(0, maxArtifactBytes),
    originalSizeBytes: originalContent.byteLength,
    truncated: true,
  };
}

function sumArtifactBytes(result: RunnerJobResult, limits: ArtifactLimits): number {
  return result.artifactManifest.artifacts.reduce((sum, artifact) => {
    const sizeBytes = artifact.sizeBytes ?? 0;

    if (sizeBytes > limits.maxArtifactBytes) {
      throw new ArtifactLimitExceededError(
        `Artifact ${artifact.id} requires ${sizeBytes} bytes, exceeding the per-artifact limit of ${limits.maxArtifactBytes} bytes.`,
      );
    }

    return sum + sizeBytes;
  }, 0);
}
