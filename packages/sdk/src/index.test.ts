import { describe, expect, it } from "vitest";

import type { PhaseEvent, RunRequest, RunResult, RunState } from "@kordo/contracts";

import {
  KordoClient,
  KordoHttpError,
  KordoValidationError,
  packageName,
  type FetchLike,
} from "./index.js";

const timestamp = "2026-05-14T20:00:00.000Z";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    title: "Verify SDK",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

const runState: RunState = {
  id: "run_123",
  workflowId: runRequest.workflowId,
  status: "queued",
  currentPhase: "queued",
  createdAt: timestamp,
  updatedAt: timestamp,
  runnerJobId: null,
  artifacts: [],
};

const phaseEvent: PhaseEvent = {
  id: "event_123",
  runId: runState.id,
  phase: "queued",
  status: "completed",
  message: "Run accepted by control plane.",
  artifactIds: [],
  occurredAt: timestamp,
};

const runResult: RunResult = {
  runId: runState.id,
  runnerJobId: "job_123",
  status: "completed",
  startedAt: timestamp,
  completedAt: timestamp,
  execution: {
    containerName: "kordo-job_123",
    command: ["node", "--version"],
    exitCode: 0,
    stdout: "v24.12.0\n",
    stderr: "",
    startedAt: timestamp,
    completedAt: timestamp,
    durationMs: 12,
    timedOut: false,
    cleanup: {
      removed: true,
    },
  },
  artifactManifest: {
    runId: runState.id,
    generatedAt: timestamp,
    artifacts: [],
  },
};

describe("@kordo/sdk", () => {
  it("exports the package name", () => {
    expect(packageName).toBe("@kordo/sdk");
  });

  it("creates runs with the expected JSON request", async () => {
    const fetch = createJsonFetch(runState);
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100/",
      fetch,
      headers: {
        authorization: "Bearer test",
      },
    });

    await expect(client.createRun(runRequest)).resolves.toEqual(runState);

    expect(fetch.requests[0]).toMatchObject({
      body: JSON.stringify(runRequest),
      method: "POST",
      url: "http://127.0.0.1:4100/runs",
    });
    expect(fetch.requests[0]?.headers).toEqual({
      authorization: "Bearer test",
      "content-type": "application/json",
    });
  });

  it("lists runs with query parameters", async () => {
    const fetch = createJsonFetch([runState]);
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100",
      fetch,
    });

    await expect(client.listRuns({ limit: 10, status: "completed" })).resolves.toEqual([runState]);

    expect(fetch.requests[0]).toMatchObject({
      method: "GET",
      url: "http://127.0.0.1:4100/runs?status=completed&limit=10",
    });
  });

  it("reads run state, events, and result", async () => {
    const fetch = createSequencedJsonFetch([runState, [phaseEvent], runResult]);
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100",
      fetch,
    });

    await expect(client.getRun("run_123")).resolves.toEqual(runState);
    await expect(client.getRunEvents("run_123")).resolves.toEqual([phaseEvent]);
    await expect(client.getRunResult("run_123")).resolves.toEqual(runResult);

    expect(fetch.requests.map((request) => request.url)).toEqual([
      "http://127.0.0.1:4100/runs/run_123",
      "http://127.0.0.1:4100/runs/run_123/events",
      "http://127.0.0.1:4100/runs/run_123/result",
    ]);
  });

  it("reads artifact text", async () => {
    const fetch = createTextFetch("v24.12.0\n");
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100",
      fetch,
    });

    await expect(client.getArtifactText("run_123", "artifact_123")).resolves.toBe("v24.12.0\n");

    expect(fetch.requests[0]).toMatchObject({
      method: "GET",
      url: "http://127.0.0.1:4100/runs/run_123/artifacts/artifact_123",
    });
  });

  it("throws a typed HTTP error for non-2xx responses", async () => {
    const fetch = createJsonFetch({ error: "RunNotFound" }, { status: 404 });
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100",
      fetch,
    });

    await expect(client.getRun("run_missing")).rejects.toMatchObject({
      body: {
        error: "RunNotFound",
      },
      name: "KordoHttpError",
      status: 404,
    } satisfies Partial<KordoHttpError>);
  });

  it("throws a typed validation error for invalid API responses", async () => {
    const fetch = createJsonFetch({ id: "run_123" });
    const client = new KordoClient({
      baseUrl: "http://127.0.0.1:4100",
      fetch,
    });

    await expect(client.getRun("run_123")).rejects.toBeInstanceOf(KordoValidationError);
  });
});

interface CapturedRequest {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: string;
  url: string;
}

interface CapturingFetch extends FetchLike {
  requests: CapturedRequest[];
}

function createJsonFetch(body: unknown, init: ResponseInit = {}): CapturingFetch {
  return createSequencedJsonFetch([body], init);
}

function createSequencedJsonFetch(bodies: unknown[], init: ResponseInit = {}): CapturingFetch {
  const requests: CapturedRequest[] = [];
  let index = 0;
  const fetch: CapturingFetch = async (input, requestInit) => {
    requests.push(captureRequest(input, requestInit));
    const body = bodies[index] ?? bodies[bodies.length - 1];
    index += 1;

    return new Response(JSON.stringify(body), {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
      ...init,
    });
  };
  fetch.requests = requests;

  return fetch;
}

function createTextFetch(body: string, init: ResponseInit = {}): CapturingFetch {
  const requests: CapturedRequest[] = [];
  const fetch: CapturingFetch = async (input, requestInit) => {
    requests.push(captureRequest(input, requestInit));

    return new Response(body, {
      status: 200,
      ...init,
    });
  };
  fetch.requests = requests;

  return fetch;
}

function captureRequest(input: string | URL, init: RequestInit | undefined): CapturedRequest {
  const request: CapturedRequest = {
    url: input.toString(),
  };

  if (init?.body !== undefined) {
    request.body = init.body;
  }

  if (init?.headers !== undefined) {
    request.headers = init.headers;
  }

  if (init?.method !== undefined) {
    request.method = init.method;
  }

  return request;
}
