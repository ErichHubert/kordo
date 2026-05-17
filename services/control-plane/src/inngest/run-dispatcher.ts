import type { RunnerJob } from "@kordo/contracts";

import { createRunCreatedEvent, type KordoRunCreatedEventPayload } from "./events.js";
import type { RunDispatcher } from "../run-dispatcher.js";

export interface InngestEventSender {
  send(payload: KordoRunCreatedEventPayload): Promise<unknown>;
}

export interface InngestRunDispatcherOptions {
  eventSender: InngestEventSender;
}

export class InngestRunDispatcher implements RunDispatcher {
  constructor(private readonly options: InngestRunDispatcherOptions) {}

  async dispatch(job: RunnerJob): Promise<void> {
    await this.options.eventSender.send(createRunCreatedEvent(job));
  }
}

export function createInngestRunDispatcher(options: InngestRunDispatcherOptions): RunDispatcher {
  return new InngestRunDispatcher(options);
}
