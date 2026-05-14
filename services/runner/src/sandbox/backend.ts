import type { RunnerJob, SandboxExecutionResult } from "@kordo/contracts";

export interface SandboxBackend {
  execute(job: RunnerJob): Promise<SandboxExecutionResult>;
}
