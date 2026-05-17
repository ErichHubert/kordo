import { RunnerJobSchema, type RunnerJob } from "@kordo/contracts";

export const KORDO_RUN_CREATED_EVENT_NAME = "kordo/run.created";

export interface KordoRunCreatedEventData {
  job: RunnerJob;
}

export interface KordoRunCreatedEventPayload {
  data: KordoRunCreatedEventData;
  id: string;
  name: typeof KORDO_RUN_CREATED_EVENT_NAME;
}

export function createRunCreatedEvent(job: RunnerJob): KordoRunCreatedEventPayload {
  return {
    data: {
      job,
    },
    id: job.id,
    name: KORDO_RUN_CREATED_EVENT_NAME,
  };
}

export function parseRunCreatedEventJob(data: unknown): RunnerJob {
  const rawJob =
    data && typeof data === "object" && "job" in data ? (data as { job?: unknown }).job : undefined;

  return RunnerJobSchema.parse(rawJob);
}
