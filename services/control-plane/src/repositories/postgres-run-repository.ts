import { eq, asc } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import {
  PhaseEventSchema,
  RunStateSchema,
  type PhaseEvent,
  type RunRequest,
  type RunState,
} from "@kordo/contracts";

import * as schema from "../db/schema.js";
import { createQueuedRun, type CreateRunResult, type RunRepository } from "./run-repository.js";

type Database = NodePgDatabase<typeof schema>;

type RunRow = typeof schema.runs.$inferSelect;

type RunEventRow = typeof schema.runEvents.$inferSelect;

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

  async listRunEvents(runId: string): Promise<PhaseEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.runEvents)
      .where(eq(schema.runEvents.runId, runId))
      .orderBy(asc(schema.runEvents.occurredAt));

    return rows.map(mapRunEventRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
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
