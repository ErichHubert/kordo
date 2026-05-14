import { RunnerJobResultSchema, type RunnerJob, type RunnerJobResult } from "@kordo/contracts";

export interface RunnerJobRepository {
  createJob(job: RunnerJob): Promise<RunnerJobResult>;
  getJob(id: string): Promise<RunnerJobResult | null>;
}

export class InMemoryRunnerJobRepository implements RunnerJobRepository {
  private readonly jobs = new Map<string, RunnerJobResult>();

  async createJob(job: RunnerJob): Promise<RunnerJobResult> {
    const now = new Date().toISOString();
    const result = RunnerJobResultSchema.parse({
      id: job.id,
      runId: job.runId,
      status: "completed",
      startedAt: now,
      completedAt: now,
      artifactManifest: {
        runId: job.runId,
        generatedAt: now,
        artifacts: [],
        summary: "Runner stub completed without sandbox execution.",
      },
      summary: "Runner stub completed without sandbox execution.",
    });

    this.jobs.set(result.id, result);
    return result;
  }

  async getJob(id: string): Promise<RunnerJobResult | null> {
    return this.jobs.get(id) ?? null;
  }
}

export function createInMemoryRunnerJobRepository(): RunnerJobRepository {
  return new InMemoryRunnerJobRepository();
}
