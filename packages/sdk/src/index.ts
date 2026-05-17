import {
  PhaseEventSchema,
  RunRequestSchema,
  RunResultSchema,
  RunStateSchema,
  RunStatusSchema,
  type PhaseEvent,
  type RunRequest,
  type RunResult,
  type RunState,
  type RunStatus,
} from "@kordo/contracts";

export const packageName = "@kordo/sdk";

export interface KordoClientOptions {
  baseUrl: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
}

export interface ListRunsQuery {
  limit?: number;
  status?: RunStatus;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface Schema<T> {
  safeParse(input: unknown):
    | {
        data: T;
        success: true;
      }
    | {
        error: {
          issues: unknown[];
        };
        success: false;
      };
}

export class KordoHttpError extends Error {
  readonly body: unknown;
  readonly method: string;
  readonly status: number;
  readonly url: string;

  constructor(options: { body: unknown; method: string; status: number; url: string }) {
    super(`Kordo API request failed with HTTP ${options.status}.`);
    this.name = "KordoHttpError";
    this.body = options.body;
    this.method = options.method;
    this.status = options.status;
    this.url = options.url;
  }
}

export class KordoValidationError extends Error {
  readonly issues: unknown[];

  constructor(message: string, issues: unknown[]) {
    super(message);
    this.name = "KordoValidationError";
    this.issues = issues;
  }
}

export class KordoClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly headers: Record<string, string>;

  constructor(options: KordoClientOptions) {
    const fetchFn = options.fetch ?? globalThis.fetch?.bind(globalThis);

    if (!fetchFn) {
      throw new Error("A fetch implementation is required.");
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchFn = fetchFn;
    this.headers = options.headers ?? {};
  }

  async createRun(request: RunRequest): Promise<RunState> {
    const parsed = RunRequestSchema.safeParse(request);

    if (!parsed.success) {
      throw new KordoValidationError(
        "Run request failed contract validation.",
        parsed.error.issues,
      );
    }

    return this.requestJson({
      body: parsed.data,
      method: "POST",
      path: "/runs",
      schema: RunStateSchema,
    });
  }

  async listRuns(query: ListRunsQuery = {}): Promise<RunState[]> {
    const path = createRunsListPath(query);

    return this.requestJson({
      method: "GET",
      path,
      schema: RunStateSchema.array(),
    });
  }

  async getRun(runId: string): Promise<RunState> {
    return this.requestJson({
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}`,
      schema: RunStateSchema,
    });
  }

  async getRunEvents(runId: string): Promise<PhaseEvent[]> {
    return this.requestJson({
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/events`,
      schema: PhaseEventSchema.array(),
    });
  }

  async getRunResult(runId: string): Promise<RunResult> {
    return this.requestJson({
      method: "GET",
      path: `/runs/${encodeURIComponent(runId)}/result`,
      schema: RunResultSchema,
    });
  }

  async getArtifactText(runId: string, artifactId: string): Promise<string> {
    const method = "GET";
    const url = this.createUrl(
      `/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`,
    );
    const response = await this.fetchFn(url, {
      headers: this.headers,
      method,
    });

    if (!response.ok) {
      throw new KordoHttpError({
        body: await readResponseBody(response),
        method,
        status: response.status,
        url: url.toString(),
      });
    }

    return response.text();
  }

  private async requestJson<T>(options: {
    body?: unknown;
    method: string;
    path: string;
    schema: Schema<T>;
  }): Promise<T> {
    const url = this.createUrl(options.path);
    const init: RequestInit = {
      headers: {
        ...this.headers,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      method: options.method,
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchFn(url, init);

    if (!response.ok) {
      throw new KordoHttpError({
        body: await readResponseBody(response),
        method: options.method,
        status: response.status,
        url: url.toString(),
      });
    }

    const body = await response.json();
    const parsed = options.schema.safeParse(body);

    if (!parsed.success) {
      throw new KordoValidationError(
        "Kordo API response failed contract validation.",
        parsed.error.issues,
      );
    }

    return parsed.data;
  }

  private createUrl(path: string): URL {
    return new URL(`${this.baseUrl}${path}`);
  }
}

function createRunsListPath(query: ListRunsQuery): string {
  const params = new URLSearchParams();

  if (query.status !== undefined) {
    const parsedStatus = RunStatusSchema.safeParse(query.status);

    if (!parsedStatus.success) {
      throw new KordoValidationError(
        "Run status failed contract validation.",
        parsedStatus.error.issues,
      );
    }

    params.set("status", parsedStatus.data);
  }

  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }

  const queryString = params.toString();
  return queryString ? `/runs?${queryString}` : "/runs";
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
