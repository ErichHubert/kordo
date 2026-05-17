import { randomUUID } from "node:crypto";

import {
  type ArtifactRef,
  type FailureReason,
  PhaseEventSchema,
  RunResultSchema,
  RunStateSchema,
  type PhaseEvent,
  type RunRequest,
  type RunResult,
  type RunStatus,
  type RunState,
  type RunnerJobResult,
} from "@kordo/contracts";

export interface CreateRunResult {
  run: RunState;
  events: PhaseEvent[];
}

export interface ListRunsOptions {
  limit: number;
  status?: RunStatus;
}

export interface ListArtifactCleanupCandidatesOptions {
  expiresBefore: Date;
  limit: number;
}

export interface ArtifactCleanupCandidate {
  artifacts: ArtifactRef[];
  runId: string;
}

export interface RunRepository {
  createRun(request: RunRequest): Promise<CreateRunResult>;
  listArtifactCleanupCandidates(
    options: ListArtifactCleanupCandidatesOptions,
  ): Promise<ArtifactCleanupCandidate[]>;
  listRuns(options: ListRunsOptions): Promise<RunState[]>;
  getRun(id: string): Promise<RunState | null>;
  getRunResult(runId: string): Promise<RunResult | null>;
  listRunEvents(runId: string): Promise<PhaseEvent[]>;
  markRunRunning(runId: string, runnerJobId: string): Promise<RunState>;
  finishRunFromRunnerResult(result: RunnerJobResult): Promise<RunState>;
  failRun(
    runId: string,
    runnerJobId: string,
    failureReason: FailureReason,
    message: string,
  ): Promise<RunState>;
  close?(): Promise<void>;
}

export function createQueuedRun(request: RunRequest, now = new Date()): CreateRunResult {
  const timestamp = now.toISOString();
  const runId = `run_${randomUUID()}`;
  const eventId = `event_${randomUUID()}`;

  const run = RunStateSchema.parse({
    id: runId,
    workflowId: request.workflowId,
    status: "queued",
    currentPhase: "queued",
    createdAt: timestamp,
    updatedAt: timestamp,
    runnerJobId: null,
    artifacts: [],
  });

  const queuedEvent = PhaseEventSchema.parse({
    id: eventId,
    runId,
    phase: "queued",
    status: "completed",
    message: "Run accepted by control plane.",
    artifactIds: [],
    occurredAt: timestamp,
  });

  return {
    run,
    events: [queuedEvent],
  };
}

export function createRunResultFromRunnerResult(result: RunnerJobResult): RunResult {
  return RunResultSchema.parse({
    runId: result.runId,
    runnerJobId: result.id,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    execution: result.execution,
    artifactManifest: result.artifactManifest,
    ...(result.summary ? { summary: result.summary } : {}),
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
  });
}

export function createPhaseEvent(
  runId: string,
  phase: string,
  status: "started" | "completed" | "failed",
  message: string,
  artifactIds: string[] = [],
  now = new Date(),
): PhaseEvent {
  return PhaseEventSchema.parse({
    id: `event_${randomUUID()}`,
    runId,
    phase,
    status,
    message,
    artifactIds,
    occurredAt: now.toISOString(),
  });
}
