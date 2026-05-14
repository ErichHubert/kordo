import {
  SandboxExecutionResultSchema,
  RunnerJobResultSchema,
  type RunnerJob,
  type RunnerJobResult,
  type SandboxExecutionResult,
} from "@kordo/contracts";

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
    let result: RunnerJobResult;

    try {
      const execution = await this.sandboxBackend.execute(job);
      result = createRunnerJobResultFromExecution(job, execution);
    } catch (error) {
      result = createRunnerJobResultFromSandboxError(job, error);
    }

    this.jobs.set(result.id, result);
    return result;
  }

  async getJob(id: string): Promise<RunnerJobResult | null> {
    return this.jobs.get(id) ?? null;
  }
}

function createRunnerJobResultFromExecution(
  job: RunnerJob,
  execution: SandboxExecutionResult,
): RunnerJobResult {
  const status = execution.exitCode === 0 && !execution.timedOut ? "completed" : "failed";

  return RunnerJobResultSchema.parse({
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
}

function createRunnerJobResultFromSandboxError(job: RunnerJob, error: unknown): RunnerJobResult {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Sandbox backend failed.";
  const execution = SandboxExecutionResultSchema.parse({
    containerName: createFallbackContainerName(job.id),
    command: job.command.argv,
    exitCode: 127,
    stdout: "",
    stderr: message,
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    timedOut: false,
    cleanup: {
      removed: false,
      message: "Sandbox backend failed before cleanup could be confirmed.",
    },
  });

  return RunnerJobResultSchema.parse({
    id: job.id,
    runId: job.runId,
    status: "failed",
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    execution,
    artifactManifest: {
      runId: job.runId,
      generatedAt: execution.completedAt,
      artifacts: [],
      summary: "Sandbox backend failed before command execution.",
    },
    summary: "Sandbox backend failed before command execution.",
    failureReason: {
      code: "SandboxBackendFailed",
      message,
    },
  });
}

function createFallbackContainerName(jobId: string): string {
  return `kordo-${jobId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export function createInMemoryRunnerJobRepository(
  sandboxBackend: SandboxBackend = new DockerLocalSandboxBackend(),
): RunnerJobRepository {
  return new InMemoryRunnerJobRepository(sandboxBackend);
}
