import { RunnerJobResultSchema, type RunnerJobResult } from "@kordo/contracts";

import type { ArtifactStore } from "./artifact-store.js";

export async function materializeRunnerResultArtifacts(
  result: RunnerJobResult,
  artifactStore: ArtifactStore,
): Promise<RunnerJobResult> {
  const createdAt = new Date(result.completedAt);
  const stdoutArtifact = await artifactStore.writeArtifact({
    runId: result.runId,
    kind: "log",
    name: "stdout.log",
    content: result.execution.stdout,
    contentType: "text/plain; charset=utf-8",
    createdAt,
  });
  const stderrArtifact = await artifactStore.writeArtifact({
    runId: result.runId,
    kind: "log",
    name: "stderr.log",
    content: result.execution.stderr,
    contentType: "text/plain; charset=utf-8",
    createdAt,
  });

  return RunnerJobResultSchema.parse({
    ...result,
    artifactManifest: {
      ...result.artifactManifest,
      artifacts: [...result.artifactManifest.artifacts, stdoutArtifact, stderrArtifact],
    },
  });
}
