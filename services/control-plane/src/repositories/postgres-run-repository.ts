import { asc, desc, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

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

import * as schema from "../db/schema.js";
import {
  createPhaseEvent,
  createQueuedRun,
  createRunResultFromRunnerResult,
  type CreateRunResult,
  type ListRunsOptions,
  type RunRepository,
} from "./run-repository.js";

type Database = NodePgDatabase<typeof schema>;

type RunRow = typeof schema.runs.$inferSelect;

type RunEventRow = typeof schema.runEvents.$inferSelect;

type RunResultRow = typeof schema.runResults.$inferSelect;

export class PostgresRunRepository implements RunRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly db: Database,
  ) {}

  async createRun(request: RunRequest): Promise<CreateRunResult> {
    const result = createQueuedRun(request);
    const [event] = result.events;

    if (!event) {
      throw new Error("Queued run creation must produce an initial event.");
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.runs).values({
        id: result.run.id,
        workflowId: result.run.workflowId,
        status: result.run.status,
        currentPhase: result.run.currentPhase,
        createdAt: new Date(result.run.createdAt),
        updatedAt: new Date(result.run.updatedAt),
        runnerJobId: result.run.runnerJobId,
        artifacts: result.run.artifacts,
        failureReason: result.run.failureReason,
      });

      await tx.insert(schema.runEvents).values({
        id: event.id,
        runId: event.runId,
        phase: event.phase,
        status: event.status,
        message: event.message,
        artifactIds: event.artifactIds,
        occurredAt: new Date(event.occurredAt),
      });
    });

    return result;
  }

  async getRun(id: string): Promise<RunState | null> {
    const rows = await this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);

    const [row] = rows;
    return row ? mapRunRow(row) : null;
  }

  async listRuns(options: ListRunsOptions): Promise<RunState[]> {
    const rows = options.status
      ? await this.db
          .select()
          .from(schema.runs)
          .where(eq(schema.runs.status, options.status))
          .orderBy(desc(schema.runs.createdAt))
          .limit(options.limit)
      : await this.db
          .select()
          .from(schema.runs)
          .orderBy(desc(schema.runs.createdAt))
          .limit(options.limit);

    return rows.map(mapRunRow);
  }

  async getRunResult(runId: string): Promise<RunResult | null> {
    const rows = await this.db
      .select()
      .from(schema.runResults)
      .where(eq(schema.runResults.runId, runId))
      .limit(1);

    const [row] = rows;
    return row ? mapRunResultRow(row) : null;
  }

  async listRunEvents(runId: string): Promise<PhaseEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.runEvents)
      .where(eq(schema.runEvents.runId, runId))
      .orderBy(asc(schema.runEvents.occurredAt));

    return rows.map(mapRunEventRow);
  }

  async markRunRunning(runId: string, runnerJobId: string): Promise<RunState> {
    const now = new Date();
    const event = createPhaseEvent(runId, "runner", "started", "Runner job started.", [], now);

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.runs)
        .set({
          status: "running",
          currentPhase: "runner",
          updatedAt: now,
          runnerJobId,
        })
        .where(eq(schema.runs.id, runId));

      await tx.insert(schema.runEvents).values({
        id: event.id,
        runId: event.runId,
        phase: event.phase,
        status: event.status,
        message: event.message,
        artifactIds: event.artifactIds,
        occurredAt: new Date(event.occurredAt),
      });
    });

    return this.requireRun(runId);
  }

  async finishRunFromRunnerResult(result: RunnerJobResult): Promise<RunState> {
    const runResult = createRunResultFromRunnerResult(result);
    const event = createPhaseEvent(
      result.runId,
      "runner",
      result.status,
      result.summary ?? "Runner job finished.",
      result.artifactManifest.artifacts.map((artifact) => artifact.id),
      new Date(result.completedAt),
    );

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.runs)
        .set({
          status: result.status,
          currentPhase: null,
          updatedAt: new Date(result.completedAt),
          runnerJobId: result.id,
          artifacts: result.artifactManifest.artifacts,
          failureReason: result.failureReason,
        })
        .where(eq(schema.runs.id, result.runId));

      await tx.insert(schema.runEvents).values({
        id: event.id,
        runId: event.runId,
        phase: event.phase,
        status: event.status,
        message: event.message,
        artifactIds: event.artifactIds,
        occurredAt: new Date(event.occurredAt),
      });

      await tx.insert(schema.runResults).values({
        runId: runResult.runId,
        runnerJobId: runResult.runnerJobId,
        status: runResult.status,
        startedAt: new Date(runResult.startedAt),
        completedAt: new Date(runResult.completedAt),
        execution: runResult.execution,
        artifactManifest: runResult.artifactManifest,
        summary: runResult.summary,
        failureReason: runResult.failureReason,
      });
    });

    return this.requireRun(result.runId);
  }

  async failRun(
    runId: string,
    runnerJobId: string,
    failureReason: FailureReason,
    message: string,
  ): Promise<RunState> {
    const now = new Date();
    const event = createPhaseEvent(runId, "runner", "failed", message, [], now);

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.runs)
        .set({
          status: "failed",
          currentPhase: null,
          updatedAt: now,
          runnerJobId,
          failureReason,
        })
        .where(eq(schema.runs.id, runId));

      await tx.insert(schema.runEvents).values({
        id: event.id,
        runId: event.runId,
        phase: event.phase,
        status: event.status,
        message: event.message,
        artifactIds: event.artifactIds,
        occurredAt: new Date(event.occurredAt),
      });
    });

    return this.requireRun(runId);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async requireRun(id: string): Promise<RunState> {
    const run = await this.getRun(id);

    if (!run) {
      throw new Error(`Run not found: ${id}`);
    }

    return run;
  }
}

export function createPostgresRunRepository(databaseUrl: string): RunRepository {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return new PostgresRunRepository(pool, db);
}

function mapRunRow(row: RunRow): RunState {
  const run = {
    id: row.id,
    workflowId: row.workflowId,
    status: row.status,
    currentPhase: row.currentPhase,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    runnerJobId: row.runnerJobId,
    artifacts: row.artifacts,
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
  };

  return RunStateSchema.parse(run);
}

function mapRunEventRow(row: RunEventRow): PhaseEvent {
  return PhaseEventSchema.parse({
    id: row.id,
    runId: row.runId,
    phase: row.phase,
    status: row.status,
    ...(row.message ? { message: row.message } : {}),
    artifactIds: row.artifactIds,
    occurredAt: row.occurredAt.toISOString(),
  });
}

function mapRunResultRow(row: RunResultRow): RunResult {
  return RunResultSchema.parse({
    runId: row.runId,
    runnerJobId: row.runnerJobId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
    execution: row.execution,
    artifactManifest: row.artifactManifest,
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
  });
}
