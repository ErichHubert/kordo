CREATE TABLE "run_results" (
	"run_id" text PRIMARY KEY NOT NULL,
	"runner_job_id" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"execution" jsonb NOT NULL,
	"artifact_manifest" jsonb NOT NULL,
	"summary" text,
	"failure_reason" jsonb
);
--> statement-breakpoint
ALTER TABLE "run_results" ADD CONSTRAINT "run_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_results_runner_job_id_idx" ON "run_results" USING btree ("runner_job_id");