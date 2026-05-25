import { RunnerJobSchema, type RunnerJob } from "@kordo/contracts";

export const KORDO_RUN_CREATED_EVENT_KEY = "kordo.run.created";

export interface KordoRunCreatedEventData {
  job: RunnerJob;
}

export function createRunCreatedEventData(job: RunnerJob): KordoRunCreatedEventData {
  return {
    job,
  };
}

export function parseRunCreatedEventJob(data: unknown): RunnerJob {
  const rawJob =
    data && typeof data === "object" && "job" in data ? (data as { job?: unknown }).job : undefined;

  return RunnerJobSchema.parse(rawJob);
}
