import type { RunnerJob } from "@kordo/contracts";

import type { RunDispatcher } from "../run-dispatcher.js";
import {
  createRunCreatedEventData,
  KORDO_RUN_CREATED_EVENT_KEY,
  type KordoRunCreatedEventData,
} from "./events.js";

export interface HatchetEventPublisher {
  push(
    eventKey: string,
    payload: KordoRunCreatedEventData,
    options?: { additionalMetadata?: Record<string, string> },
  ): Promise<unknown>;
}

export interface HatchetRunDispatcherOptions {
  eventPublisher: HatchetEventPublisher;
}

export class HatchetRunDispatcher implements RunDispatcher {
  constructor(private readonly options: HatchetRunDispatcherOptions) {}

  async dispatch(job: RunnerJob): Promise<void> {
    await this.options.eventPublisher.push(
      KORDO_RUN_CREATED_EVENT_KEY,
      createRunCreatedEventData(job),
      {
        additionalMetadata: {
          runId: job.runId,
          runnerJobId: job.id,
          workflowId: job.workflowId,
        },
      },
    );
  }
}

export function createHatchetRunDispatcher(options: HatchetRunDispatcherOptions): RunDispatcher {
  return new HatchetRunDispatcher(options);
}
