import type { BaseWorkflowDeclaration, JsonObject } from "@hatchet-dev/typescript-sdk";

import {
  cleanupExpiredArtifacts,
  type ArtifactCleanupSummary,
} from "../artifacts/artifact-cleanup.js";
import type { ArtifactLimits } from "../artifacts/artifact-limits.js";
import type { ArtifactStore } from "../artifacts/artifact-store.js";
import type { RunRepository } from "../repositories/run-repository.js";
import {
  executeRunnerJob,
  recordRunnerJobExecutionFailure,
  type RunExecutorLogger,
} from "../run-executor.js";
import type { RunnerClient } from "../runner-client.js";
import { KORDO_RUN_CREATED_EVENT_KEY, parseRunCreatedEventJob } from "./events.js";
import type { KordoHatchetClient } from "./client.js";

export interface KordoHatchetWorkflowsOptions {
  artifactCleanupBatchSize: number;
  artifactCleanupCron: string;
  artifactLimits?: Partial<ArtifactLimits>;
  artifactRetentionDays: number;
  artifactStore: ArtifactStore;
  hatchet: KordoHatchetClient;
  logger?: RunExecutorLogger;
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export interface RunCreatedWorkflowExecutionOptions {
  artifactLimits?: Partial<ArtifactLimits>;
  artifactStore: ArtifactStore;
  logger?: RunExecutorLogger;
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export interface RunCreatedWorkflowResult {
  runId: string;
  runnerJobId: string;
}

export interface ArtifactCleanupWorkflowResult {
  summary: ArtifactCleanupSummary;
}

type KordoHatchetWorkflow = BaseWorkflowDeclaration<JsonObject, JsonObject>;

export function createKordoHatchetWorkflows(
  options: KordoHatchetWorkflowsOptions,
): KordoHatchetWorkflow[] {
  return [createRunCreatedWorkflow(options), createArtifactCleanupWorkflow(options)];
}

export function createRunCreatedWorkflow(
  options: KordoHatchetWorkflowsOptions,
): KordoHatchetWorkflow {
  const workflow = options.hatchet.workflow<JsonObject, { "execute-run": JsonObject }>({
    name: "execute-run",
    on: {
      event: KORDO_RUN_CREATED_EVENT_KEY,
    },
  });

  workflow.task({
    name: "execute-run",
    executionTimeout: "10m",
    retries: 0,
    fn: async (input) => toJsonObject(await executeRunCreatedWorkflow(input, options)),
  });

  return workflow as KordoHatchetWorkflow;
}

export async function executeRunCreatedWorkflow(
  input: unknown,
  options: RunCreatedWorkflowExecutionOptions,
): Promise<RunCreatedWorkflowResult> {
  const job = parseRunCreatedEventJob(input);

  try {
    await executeRunnerJob(job, options);
  } catch (error) {
    await recordRunnerJobExecutionFailure(job, error, {
      ...(options.logger ? { logger: options.logger } : {}),
      repository: options.repository,
    });
    throw error;
  }

  return {
    runId: job.runId,
    runnerJobId: job.id,
  };
}

export function createArtifactCleanupWorkflow(
  options: KordoHatchetWorkflowsOptions,
): KordoHatchetWorkflow {
  const workflow = options.hatchet.workflow<
    JsonObject,
    { "cleanup-expired-artifacts": JsonObject }
  >({
    name: "cleanup-expired-artifacts",
    on: {
      cron: options.artifactCleanupCron,
    },
  });

  workflow.task({
    name: "cleanup-expired-artifacts",
    executionTimeout: "5m",
    retries: 0,
    fn: async () => toJsonObject(await executeArtifactCleanupWorkflow(options)),
  });

  return workflow as KordoHatchetWorkflow;
}

export async function executeArtifactCleanupWorkflow(
  options: Pick<
    KordoHatchetWorkflowsOptions,
    "artifactCleanupBatchSize" | "artifactRetentionDays" | "artifactStore" | "repository"
  >,
): Promise<ArtifactCleanupWorkflowResult> {
  const summary = await cleanupExpiredArtifacts({
    artifactStore: options.artifactStore,
    batchSize: options.artifactCleanupBatchSize,
    repository: options.repository,
    retentionDays: options.artifactRetentionDays,
  });

  return {
    summary,
  };
}

function toJsonObject(value: object): JsonObject {
  return value as JsonObject;
}
