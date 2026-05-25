import type { RunnerJob } from "@kordo/contracts";

export interface RunDispatcher {
  dispatch(job: RunnerJob): Promise<void> | void;
  waitForIdle?(): Promise<void>;
  close?(): Promise<void>;
}
