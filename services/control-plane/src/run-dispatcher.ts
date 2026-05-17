import type { FailureReason, RunnerJob } from "@kordo/contracts";

import { ArtifactLimitExceededError, type ArtifactLimits } from "./artifacts/artifact-limits.js";
import type { ArtifactStore } from "./artifacts/artifact-store.js";
import { materializeRunnerResultArtifacts } from "./artifacts/result-artifacts.js";
import type { RunRepository } from "./repositories/run-repository.js";
import type { RunnerClient } from "./runner-client.js";

export interface RunDispatcher {
  dispatch(job: RunnerJob): void;
  waitForIdle?(): Promise<void>;
  close?(): Promise<void>;
}

export interface RunDispatcherLogger {
  error(payload: Record<string, unknown>, message: string): void;
}

export interface InProcessRunDispatcherOptions {
  artifactLimits?: Partial<ArtifactLimits>;
  artifactStore: ArtifactStore;
  logger?: RunDispatcherLogger;
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export class InProcessRunDispatcher implements RunDispatcher {
  private readonly inFlight = new Set<Promise<void>>();

  private closed = false;

  constructor(private readonly options: InProcessRunDispatcherOptions) {}

  dispatch(job: RunnerJob): void {
    if (this.closed) {
      throw new Error("Run dispatcher is closed.");
    }

    const task = this.dispatchInBackground(job);
    this.inFlight.add(task);
    task
      .finally(() => this.inFlight.delete(task))
      .catch((error: unknown) => {
        this.options.logger?.error(
          createLogPayload(job, error),
          "Run dispatch task escaped with an unexpected rejection",
        );
      });
  }

  async waitForIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.waitForIdle();
  }

  private async dispatchInBackground(job: RunnerJob): Promise<void> {
    try {
      await this.options.repository.markRunRunning(job.runId, job.id);
      const runnerResult = await this.options.runnerClient.runJob(job);
      const runnerResultWithArtifacts = await materializeRunnerResultArtifacts(
        runnerResult,
        this.options.artifactStore,
        this.options.artifactLimits ? { limits: this.options.artifactLimits } : {},
      );
      await this.options.repository.finishRunFromRunnerResult(runnerResultWithArtifacts);
    } catch (error) {
      await this.recordDispatchFailure(job, error);
    }
  }

  private async recordDispatchFailure(job: RunnerJob, error: unknown): Promise<void> {
    const failureReason = createDispatchFailureReason(error);

    this.options.logger?.error(
      {
        ...createLogPayload(job, error),
        failureReason,
      },
      "Runner job failed before completion",
    );

    try {
      await this.options.repository.failRun(
        job.runId,
        job.id,
        failureReason,
        "Runner job failed before completion.",
      );
    } catch (persistError) {
      this.options.logger?.error(
        {
          ...createLogPayload(job, persistError),
          originalError: error,
        },
        "Runner dispatch failure could not be persisted",
      );
    }
  }
}

function createDispatchFailureReason(error: unknown): FailureReason {
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

function createLogPayload(job: RunnerJob, error: unknown): Record<string, unknown> {
  return {
    error,
    runId: job.runId,
    runnerJobId: job.id,
    workflowId: job.workflowId,
  };
}

export function createInProcessRunDispatcher(
  options: InProcessRunDispatcherOptions,
): RunDispatcher {
  return new InProcessRunDispatcher(options);
}
