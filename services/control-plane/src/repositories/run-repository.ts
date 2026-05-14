import { randomUUID } from "node:crypto";

import {
  PhaseEventSchema,
  RunStateSchema,
  type PhaseEvent,
  type RunRequest,
  type RunState,
} from "@kordo/contracts";

export interface CreateRunResult {
  run: RunState;
  events: PhaseEvent[];
}

export interface RunRepository {
  createRun(request: RunRequest): Promise<CreateRunResult>;
  getRun(id: string): Promise<RunState | null>;
  listRunEvents(runId: string): Promise<PhaseEvent[]>;
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
