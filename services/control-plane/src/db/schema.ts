import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { ArtifactRef, FailureReason, PhaseStatus, RunStatus } from "@kordo/contracts";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  status: text("status").$type<RunStatus>().notNull(),
  currentPhase: text("current_phase"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  runnerJobId: text("runner_job_id"),
  artifacts: jsonb("artifacts").$type<ArtifactRef[]>().notNull(),
  failureReason: jsonb("failure_reason").$type<FailureReason>(),
});

export const runEvents = pgTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    phase: text("phase").notNull(),
    status: text("status").$type<PhaseStatus>().notNull(),
    message: text("message"),
    artifactIds: jsonb("artifact_ids").$type<string[]>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("run_events_run_id_occurred_at_idx").on(table.runId, table.occurredAt)],
);
