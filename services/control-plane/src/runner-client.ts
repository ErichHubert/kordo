import { RunnerJobResultSchema, type RunnerJob, type RunnerJobResult } from "@kordo/contracts";

export interface RunnerClient {
  runJob(job: RunnerJob): Promise<RunnerJobResult>;
}

export class HttpRunnerClient implements RunnerClient {
  constructor(private readonly baseUrl: string) {}

  async runJob(job: RunnerJob): Promise<RunnerJobResult> {
    const response = await fetch(new URL("/jobs", this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(job),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Runner returned ${response.status}: ${body}`);
    }

    return RunnerJobResultSchema.parse(await response.json());
  }
}
