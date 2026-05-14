import {
  PhaseEventSchema,
  RunStateSchema,
  type PhaseEvent,
  type RunRequest,
  type RunState,
} from "@kordo/contracts";

import { createQueuedRun, type CreateRunResult, type RunRepository } from "./run-repository.js";

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, RunState>();

  private readonly events = new Map<string, PhaseEvent[]>();

  async createRun(request: RunRequest): Promise<CreateRunResult> {
    const result = createQueuedRun(request);

    this.runs.set(result.run.id, RunStateSchema.parse(result.run));
    this.events.set(
      result.run.id,
      result.events.map((event) => PhaseEventSchema.parse(event)),
    );

    return result;
  }

  async getRun(id: string): Promise<RunState | null> {
    const run = this.runs.get(id);
    return run ? RunStateSchema.parse(run) : null;
  }

  async listRunEvents(runId: string): Promise<PhaseEvent[]> {
    return (this.events.get(runId) ?? []).map((event) => PhaseEventSchema.parse(event));
  }
}

export function createInMemoryRunRepository(): RunRepository {
  return new InMemoryRunRepository();
}
