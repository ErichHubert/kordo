import {
  PhaseEventSchema,
  RunRequestSchema,
  RunResultSchema,
  RunStateSchema,
  type ArtifactRef,
  type PhaseEvent,
  type RunRequest,
  type RunResult,
  type RunState,
} from "@kordo/contracts";

const DEFAULT_BASE_URL = "http://127.0.0.1:4100";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

interface SmokeConfig {
  authorization?: string;
  baseUrl: string;
  pollIntervalMs: number;
  timeoutMs: number;
}

interface JsonParser<T> {
  parse(input: unknown): T;
}

async function main(): Promise<void> {
  const config = readSmokeConfig();
  const client = new SmokeClient(config);
  const runRequest = createSmokeRunRequest();

  console.log(`Starting local smoke test against ${config.baseUrl}`);

  const createdRun = await client.createRun(runRequest);
  console.log(`Created run ${createdRun.id} with status ${createdRun.status}`);

  const finalRun = await waitForTerminalRun(client, createdRun.id, config);

  if (finalRun.status !== "completed") {
    throw new Error(
      `Smoke run ${finalRun.id} ended with status ${finalRun.status}: ${formatFailure(finalRun)}`,
    );
  }

  const events = await client.getRunEvents(finalRun.id);
  assertLifecycleEvents(finalRun.id, events);

  const result = await client.getRunResult(finalRun.id);
  assertRunResult(finalRun, result);

  const stdoutArtifact = findArtifact(finalRun.artifacts, "stdout.log");
  const stdoutText = await client.getArtifactText(finalRun.id, stdoutArtifact.id);

  if (stdoutText !== result.execution.stdout) {
    throw new Error("stdout artifact content does not match the persisted execution stdout.");
  }

  console.log(`Smoke test passed for run ${finalRun.id}`);
}

class SmokeClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: SmokeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = config.authorization ? { authorization: config.authorization } : {};
  }

  createRun(request: RunRequest): Promise<RunState> {
    return this.requestJson({
      body: request,
      expectedStatus: 202,
      method: "POST",
      path: "/runs",
      parser: RunStateSchema,
    });
  }

  getRun(runId: string): Promise<RunState> {
    return this.requestJson({
      expectedStatus: 200,
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}`,
      parser: RunStateSchema,
    });
  }

  getRunEvents(runId: string): Promise<PhaseEvent[]> {
    return this.requestJson({
      expectedStatus: 200,
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/events`,
      parser: PhaseEventSchema.array(),
    });
  }

  getRunResult(runId: string): Promise<RunResult> {
    return this.requestJson({
      expectedStatus: 200,
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/result`,
      parser: RunResultSchema,
    });
  }

  async getArtifactText(runId: string, artifactId: string): Promise<string> {
    const response = await this.request({
      expectedStatus: 200,
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`,
    });

    return response.text();
  }

  private async requestJson<T>(options: {
    body?: unknown;
    expectedStatus: number;
    method: string;
    parser: JsonParser<T>;
    path: string;
  }): Promise<T> {
    const response = await this.request(options);
    const body = await readResponseBody(response);

    return options.parser.parse(body);
  }

  private async request(options: {
    body?: unknown;
    expectedStatus: number;
    method: string;
    path: string;
  }): Promise<Response> {
    const url = `${this.baseUrl}${options.path}`;
    const headers: Record<string, string> = {
      ...this.headers,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    };

    let response: Response;

    try {
      response = await fetch(url, {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        method: options.method,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      throw new Error(
        `Request to ${url} failed. Is the control plane running? ${formatError(error)}`,
      );
    }

    if (response.status !== options.expectedStatus) {
      throw new Error(
        `${options.method} ${url} returned HTTP ${response.status}; expected ${options.expectedStatus}. Body: ${formatBody(
          await readResponseBody(response),
        )}`,
      );
    }

    return response;
  }
}

async function waitForTerminalRun(
  client: SmokeClient,
  runId: string,
  config: SmokeConfig,
): Promise<RunState> {
  const deadline = Date.now() + config.timeoutMs;
  let lastStatus: string | null = null;

  while (Date.now() <= deadline) {
    const run = await client.getRun(runId);

    if (run.status !== lastStatus) {
      console.log(`Run ${run.id} is ${run.status}`);
      lastStatus = run.status;
    }

    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return run;
    }

    await sleep(config.pollIntervalMs);
  }

  throw new Error(
    `Timed out after ${config.timeoutMs}ms waiting for run ${runId} to complete. Check the orchestrator worker, Hatchet engine, and sandbox runner logs.`,
  );
}

function createSmokeRunRequest(): RunRequest {
  return RunRequestSchema.parse({
    workflowId: "kordo.smoke.local",
    input: {
      source: "manual",
      title: "Local walking skeleton smoke test",
      body: `Created by smoke test at ${new Date().toISOString()}.`,
    },
    sandboxProfile: "docker-local-default",
    allowedGatewayRoutes: [],
  });
}

function assertLifecycleEvents(runId: string, events: PhaseEvent[]): void {
  const hasQueued = events.some(
    (event) => event.runId === runId && event.phase === "queued" && event.status === "completed",
  );
  const hasRunnerStarted = events.some(
    (event) => event.runId === runId && event.phase === "runner" && event.status === "started",
  );
  const hasRunnerCompleted = events.some(
    (event) => event.runId === runId && event.phase === "runner" && event.status === "completed",
  );

  if (!hasQueued || !hasRunnerStarted || !hasRunnerCompleted) {
    throw new Error(
      `Run ${runId} does not contain the expected queued/running/completed lifecycle events.`,
    );
  }
}

function assertRunResult(run: RunState, result: RunResult): void {
  if (result.runId !== run.id) {
    throw new Error(`Run result belongs to ${result.runId}, expected ${run.id}.`);
  }

  if (result.status !== "completed") {
    throw new Error(`Run result status is ${result.status}, expected completed.`);
  }

  if (result.execution.exitCode !== 0) {
    throw new Error(`Sandbox command exited with ${result.execution.exitCode}, expected 0.`);
  }

  if (result.execution.command.join(" ") !== "node --version") {
    throw new Error(`Unexpected smoke command: ${result.execution.command.join(" ")}`);
  }

  if (!result.execution.stdout.trim().startsWith("v")) {
    throw new Error(`Unexpected node --version stdout: ${result.execution.stdout}`);
  }

  if (!result.execution.cleanup.removed) {
    throw new Error("Sandbox cleanup did not report container removal.");
  }

  findArtifact(result.artifactManifest.artifacts, "stdout.log");
  findArtifact(result.artifactManifest.artifacts, "stderr.log");
}

function findArtifact(artifacts: ArtifactRef[], name: string): ArtifactRef {
  const artifact = artifacts.find((candidate) => candidate.name === name);

  if (!artifact) {
    throw new Error(`Missing expected artifact: ${name}`);
  }

  return artifact;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readSmokeConfig(env: NodeJS.ProcessEnv = process.env): SmokeConfig {
  return {
    ...(env.KORDO_SMOKE_AUTHORIZATION ? { authorization: env.KORDO_SMOKE_AUTHORIZATION } : {}),
    baseUrl: env.KORDO_SMOKE_CONTROL_PLANE_URL ?? DEFAULT_BASE_URL,
    pollIntervalMs: readPositiveInteger(
      env.KORDO_SMOKE_POLL_INTERVAL_MS ?? String(DEFAULT_POLL_INTERVAL_MS),
      "KORDO_SMOKE_POLL_INTERVAL_MS",
    ),
    timeoutMs: readPositiveInteger(
      env.KORDO_SMOKE_TIMEOUT_MS ?? String(DEFAULT_TIMEOUT_MS),
      "KORDO_SMOKE_TIMEOUT_MS",
    ),
  };
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function formatFailure(run: RunState): string {
  return run.failureReason
    ? `${run.failureReason.code}: ${run.failureReason.message}`
    : "no reason";
}

function formatBody(body: unknown): string {
  return typeof body === "string" ? body : JSON.stringify(body);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
