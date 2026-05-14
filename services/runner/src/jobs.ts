import { RunnerJobResultSchema, type RunnerJob, type RunnerJobResult } from "@kordo/contracts";

import { DockerLocalSandboxBackend } from "./sandbox/docker-local.js";
import type { SandboxBackend } from "./sandbox/backend.js";

export interface RunnerJobRepository {
  createJob(job: RunnerJob): Promise<RunnerJobResult>;
  getJob(id: string): Promise<RunnerJobResult | null>;
}

export class InMemoryRunnerJobRepository implements RunnerJobRepository {
  private readonly jobs = new Map<string, RunnerJobResult>();

  constructor(private readonly sandboxBackend: SandboxBackend) {}

  async createJob(job: RunnerJob): Promise<RunnerJobResult> {
    const execution = await this.sandboxBackend.execute(job);
    const status = execution.exitCode === 0 && !execution.timedOut ? "completed" : "failed";

    const result = RunnerJobResultSchema.parse({
      id: job.id,
      runId: job.runId,
      status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      execution,
      artifactManifest: {
        runId: job.runId,
        generatedAt: execution.completedAt,
        artifacts: [],
        summary:
          status === "completed"
            ? "Docker-local sandbox command completed."
            : "Docker-local sandbox command failed.",
      },
      summary:
        status === "completed"
          ? "Docker-local sandbox command completed."
          : "Docker-local sandbox command failed.",
      ...(status === "failed"
        ? {
            failureReason: {
              code: execution.timedOut ? "SandboxCommandTimedOut" : "SandboxCommandFailed",
              message: execution.timedOut
                ? `Sandbox command timed out after ${job.command.timeoutMs}ms.`
                : `Sandbox command exited with code ${execution.exitCode}.`,
            },
          }
        : {}),
    });

    this.jobs.set(result.id, result);
    return result;
  }

  async getJob(id: string): Promise<RunnerJobResult | null> {
    return this.jobs.get(id) ?? null;
  }
}

export function createInMemoryRunnerJobRepository(
  sandboxBackend: SandboxBackend = new DockerLocalSandboxBackend(),
): RunnerJobRepository {
  return new InMemoryRunnerJobRepository(sandboxBackend);
}
