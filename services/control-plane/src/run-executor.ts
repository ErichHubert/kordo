import type { FailureReason, RunnerJob } from "@kordo/contracts";

import { ArtifactLimitExceededError, type ArtifactLimits } from "./artifacts/artifact-limits.js";
import type { ArtifactStore } from "./artifacts/artifact-store.js";
import { materializeRunnerResultArtifacts } from "./artifacts/result-artifacts.js";
import type { RunRepository } from "./repositories/run-repository.js";
import type { RunnerClient } from "./runner-client.js";

export interface RunExecutorLogger {
  error(payload: Record<string, unknown>, message: string): void;
}

export interface RunExecutorOptions {
  artifactLimits?: Partial<ArtifactLimits>;
  artifactStore: ArtifactStore;
  logger?: RunExecutorLogger;
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export interface RunFailureRecorderOptions {
  logger?: RunExecutorLogger;
  repository: RunRepository;
}

export async function executeRunnerJob(job: RunnerJob, options: RunExecutorOptions): Promise<void> {
  await options.repository.markRunRunning(job.runId, job.id);
  const runnerResult = await options.runnerClient.runJob(job);
  const runnerResultWithArtifacts = await materializeRunnerResultArtifacts(
    runnerResult,
    options.artifactStore,
    options.artifactLimits ? { limits: options.artifactLimits } : {},
  );
  await options.repository.finishRunFromRunnerResult(runnerResultWithArtifacts);
}

export async function recordRunnerJobExecutionFailure(
  job: RunnerJob,
  error: unknown,
  options: RunFailureRecorderOptions,
): Promise<void> {
  const failureReason = createRunExecutionFailureReason(error);

  options.logger?.error(
    {
      ...createRunExecutionLogPayload(job, error),
      failureReason,
    },
    "Runner job failed before completion",
  );

  try {
    await options.repository.failRun(
      job.runId,
      job.id,
      failureReason,
      "Runner job failed before completion.",
    );
  } catch (persistError) {
    options.logger?.error(
      {
        ...createRunExecutionLogPayload(job, persistError),
        originalError: error,
      },
      "Runner dispatch failure could not be persisted",
    );
  }
}

export function createRunExecutionFailureReason(error: unknown): FailureReason {
  if (error instanceof ArtifactLimitExceededError) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  return {
    code: "RunnerDispatchFailed",
    message: error instanceof Error ? error.message : "Runner dispatch failed.",
  };
}

export function createRunExecutionLogPayload(
  job: RunnerJob,
  error: unknown,
): Record<string, unknown> {
  return {
    error,
    runId: job.runId,
    runnerJobId: job.id,
    workflowId: job.workflowId,
  };
}
