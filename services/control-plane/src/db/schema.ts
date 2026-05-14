import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type {
  ArtifactManifest,
  ArtifactRef,
  FailureReason,
  PhaseStatus,
  RunnerJobStatus,
  RunStatus,
  SandboxExecutionResult,
} from "@kordo/contracts";

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

export const runResults = pgTable(
  "run_results",
  {
    runId: text("run_id")
      .primaryKey()
      .references(() => runs.id, { onDelete: "cascade" }),
    runnerJobId: text("runner_job_id").notNull(),
    status: text("status").$type<RunnerJobStatus>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    execution: jsonb("execution").$type<SandboxExecutionResult>().notNull(),
    artifactManifest: jsonb("artifact_manifest").$type<ArtifactManifest>().notNull(),
    summary: text("summary"),
    failureReason: jsonb("failure_reason").$type<FailureReason>(),
  },
  (table) => [index("run_results_runner_job_id_idx").on(table.runnerJobId)],
);
