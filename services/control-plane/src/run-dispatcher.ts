import type { RunnerJob } from "@kordo/contracts";

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
      .catch(() => {
        // dispatchInBackground catches operational failures. This catch prevents
        // an unexpected rejection from escaping the background task.
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
    await this.options.repository.markRunRunning(job.runId, job.id);

    try {
      const runnerResult = await this.options.runnerClient.runJob(job);
      await this.options.repository.finishRunFromRunnerResult(runnerResult);
    } catch (error) {
      this.options.logger?.error({ error, runId: job.runId }, "Runner job failed");

      await this.options.repository.failRun(
        job.runId,
        job.id,
        {
          code: "RunnerDispatchFailed",
          message: error instanceof Error ? error.message : "Runner dispatch failed.",
        },
        "Runner job failed before completion.",
      );
    }
  }
}

export function createInProcessRunDispatcher(
  options: InProcessRunDispatcherOptions,
): RunDispatcher {
  return new InProcessRunDispatcher(options);
}
