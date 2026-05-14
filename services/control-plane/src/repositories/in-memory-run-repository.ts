import {
  PhaseEventSchema,
  RunResultSchema,
  RunStateSchema,
  type FailureReason,
  type PhaseEvent,
  type RunRequest,
  type RunResult,
  type RunState,
  type RunnerJobResult,
} from "@kordo/contracts";

import {
  createPhaseEvent,
  createQueuedRun,
  createRunResultFromRunnerResult,
  type CreateRunResult,
  type ListRunsOptions,
  type RunRepository,
} from "./run-repository.js";

export class InMemoryRunRepository implements RunRepository {
  private readonly runs = new Map<string, RunState>();

  private readonly events = new Map<string, PhaseEvent[]>();

  private readonly results = new Map<string, RunResult>();

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

  async listRuns(options: ListRunsOptions): Promise<RunState[]> {
    return [...this.runs.values()]
      .filter((run) => !options.status || run.status === options.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, options.limit)
      .map((run) => RunStateSchema.parse(run));
  }

  async getRunResult(runId: string): Promise<RunResult | null> {
    const result = this.results.get(runId);
    return result ? RunResultSchema.parse(result) : null;
  }

  async listRunEvents(runId: string): Promise<PhaseEvent[]> {
    return (this.events.get(runId) ?? []).map((event) => PhaseEventSchema.parse(event));
  }

  async markRunRunning(runId: string, runnerJobId: string): Promise<RunState> {
    const existingRun = this.requireRun(runId);
    const now = new Date().toISOString();
    const nextRun = RunStateSchema.parse({
      ...existingRun,
      status: "running",
      currentPhase: "runner",
      updatedAt: now,
      runnerJobId,
    });

    this.runs.set(runId, nextRun);
    this.appendEvent(
      createPhaseEvent(runId, "runner", "started", "Runner job started.", [], new Date(now)),
    );

    return nextRun;
  }

  async finishRunFromRunnerResult(result: RunnerJobResult): Promise<RunState> {
    const existingRun = this.requireRun(result.runId);
    const runResult = createRunResultFromRunnerResult(result);
    const nextRun = RunStateSchema.parse({
      ...existingRun,
      status: result.status,
      currentPhase: null,
      updatedAt: result.completedAt,
      runnerJobId: result.id,
      artifacts: result.artifactManifest.artifacts,
      ...(result.failureReason ? { failureReason: result.failureReason } : {}),
    });

    this.runs.set(result.runId, nextRun);
    this.results.set(result.runId, runResult);
    this.appendEvent(
      createPhaseEvent(
        result.runId,
        "runner",
        result.status,
        result.summary ?? "Runner job finished.",
        result.artifactManifest.artifacts.map((artifact) => artifact.id),
        new Date(result.completedAt),
      ),
    );

    return nextRun;
  }

  async failRun(
    runId: string,
    runnerJobId: string,
    failureReason: FailureReason,
    message: string,
  ): Promise<RunState> {
    const existingRun = this.requireRun(runId);
    const now = new Date().toISOString();
    const nextRun = RunStateSchema.parse({
      ...existingRun,
      status: "failed",
      currentPhase: null,
      updatedAt: now,
      runnerJobId,
      failureReason,
    });

    this.runs.set(runId, nextRun);
    this.appendEvent(createPhaseEvent(runId, "runner", "failed", message, [], new Date(now)));

    return nextRun;
  }

  private requireRun(id: string): RunState {
    const run = this.runs.get(id);

    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }

    return run;
  }

  private appendEvent(event: PhaseEvent): void {
    const events = this.events.get(event.runId) ?? [];
    events.push(PhaseEventSchema.parse(event));
    this.events.set(event.runId, events);
  }
}

export function createInMemoryRunRepository(): RunRepository {
  return new InMemoryRunRepository();
}
