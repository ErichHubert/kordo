import type { RunnerJob } from "@kordo/contracts";

import type { ArtifactLimits } from "./artifacts/artifact-limits.js";
import type { ArtifactStore } from "./artifacts/artifact-store.js";
import type { RunRepository } from "./repositories/run-repository.js";
import {
  createRunExecutionLogPayload,
  executeRunnerJob,
  recordRunnerJobExecutionFailure,
  type RunExecutorLogger,
} from "./run-executor.js";
import type { RunnerClient } from "./runner-client.js";

export interface RunDispatcher {
  dispatch(job: RunnerJob): Promise<void> | void;
  waitForIdle?(): Promise<void>;
  close?(): Promise<void>;
}

export type RunDispatcherLogger = RunExecutorLogger;

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
          createRunExecutionLogPayload(job, error),
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
      await executeRunnerJob(job, this.options);
    } catch (error) {
      await recordRunnerJobExecutionFailure(job, error, this.options);
    }
  }
}

export function createInProcessRunDispatcher(
  options: InProcessRunDispatcherOptions,
): RunDispatcher {
  return new InProcessRunDispatcher(options);
}
