import { cron, type Inngest, type InngestFunction } from "inngest";

import { cleanupExpiredArtifacts } from "../artifacts/artifact-cleanup.js";
import type { ArtifactLimits } from "../artifacts/artifact-limits.js";
import type { ArtifactStore } from "../artifacts/artifact-store.js";
import { materializeRunnerResultArtifacts } from "../artifacts/result-artifacts.js";
import type { RunRepository } from "../repositories/run-repository.js";
import { recordRunnerJobExecutionFailure, type RunExecutorLogger } from "../run-executor.js";
import type { RunnerClient } from "../runner-client.js";
import { KORDO_RUN_CREATED_EVENT_NAME, parseRunCreatedEventJob } from "./events.js";

export interface KordoInngestFunctionsOptions {
  artifactCleanupBatchSize: number;
  artifactLimits?: Partial<ArtifactLimits>;
  artifactRetentionDays: number;
  artifactStore: ArtifactStore;
  inngest: Inngest;
  logger?: RunExecutorLogger;
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export function createKordoInngestFunctions(
  options: KordoInngestFunctionsOptions,
): InngestFunction.Like[] {
  return [createRunCreatedFunction(options), createArtifactCleanupFunction(options)];
}

export function createRunCreatedFunction(
  options: KordoInngestFunctionsOptions,
): InngestFunction.Like {
  return options.inngest.createFunction(
    {
      id: "execute-run",
      name: "Execute Kordo run",
      retries: 3,
      triggers: { event: KORDO_RUN_CREATED_EVENT_NAME },
      onFailure: async ({ event }) => {
        const job = parseRunCreatedEventJob(event.data.event.data);

        await recordRunnerJobExecutionFailure(job, event.data.error, {
          ...(options.logger ? { logger: options.logger } : {}),
          repository: options.repository,
        });
      },
    },
    async ({ event, step }) => {
      const job = parseRunCreatedEventJob(event.data);

      await step.run("mark-run-running", () =>
        options.repository.markRunRunning(job.runId, job.id),
      );

      const runnerResult = await step.run("run-runner-job", () => options.runnerClient.runJob(job));
      const runnerResultWithArtifacts = await step.run("materialize-run-artifacts", () =>
        materializeRunnerResultArtifacts(
          runnerResult,
          options.artifactStore,
          options.artifactLimits ? { limits: options.artifactLimits } : {},
        ),
      );

      await step.run("finish-run", () =>
        options.repository.finishRunFromRunnerResult(runnerResultWithArtifacts),
      );

      return {
        runId: job.runId,
        runnerJobId: job.id,
      };
    },
  );
}

export function createArtifactCleanupFunction(
  options: KordoInngestFunctionsOptions,
): InngestFunction.Like {
  return options.inngest.createFunction(
    {
      id: "cleanup-expired-artifacts",
      name: "Clean up expired local artifacts",
      retries: 3,
      triggers: [cron("0 0 * * *")],
    },
    async ({ step }) =>
      step.run("cleanup-expired-artifacts", () =>
        cleanupExpiredArtifacts({
          artifactStore: options.artifactStore,
          batchSize: options.artifactCleanupBatchSize,
          repository: options.repository,
          retentionDays: options.artifactRetentionDays,
        }),
      ),
  );
}
