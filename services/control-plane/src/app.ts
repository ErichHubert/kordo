import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import {
  NonEmptyStringSchema,
  RunRequestSchema,
  RunStatusSchema,
  type RunResult,
  type RunStatus,
  type RunState,
} from "@kordo/contracts";

import type { ListRunsOptions, RunRepository } from "./repositories/run-repository.js";
import type { RunnerClient } from "./runner-client.js";
import { createRunnerJob } from "./runner-jobs.js";

const DEFAULT_RUN_LIST_LIMIT = 50;
const MAX_RUN_LIST_LIMIT = 100;

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  repository: RunRepository;
  runnerClient: RunnerClient;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.addHook("onClose", async () => {
    await options.repository.close?.();
  });

  app.post("/runs", async (request, reply) => {
    const parsed = RunRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "InvalidRunRequest",
        issues: parsed.error.issues,
      });
    }

    const result = await options.repository.createRun(parsed.data);
    const runnerJob = createRunnerJob(result.run, parsed.data);

    await options.repository.markRunRunning(result.run.id, runnerJob.id);

    try {
      const runnerResult = await options.runnerClient.runJob(runnerJob);
      const finishedRun = await options.repository.finishRunFromRunnerResult(runnerResult);
      return reply.code(201).send(finishedRun);
    } catch (error) {
      request.log.error({ error, runId: result.run.id }, "Runner job failed");

      const failedRun = await options.repository.failRun(
        result.run.id,
        runnerJob.id,
        {
          code: "RunnerDispatchFailed",
          message: error instanceof Error ? error.message : "Runner dispatch failed.",
        },
        "Runner job failed before completion.",
      );

      return reply.code(502).send(failedRun);
    }
  });

  app.get("/runs", async (request, reply) => {
    const parsed = parseListRunsQuery(request.query);

    if (!parsed.ok) {
      return reply.code(400).send({
        error: "InvalidRunListQuery",
        message: parsed.message,
      });
    }

    const runs = await options.repository.listRuns(parsed.value);
    return reply.send(runs satisfies RunState[]);
  });

  app.get("/runs/:id", async (request, reply) => {
    const id = parseRunId(request.params);

    if (!id) {
      return reply.code(400).send({ error: "InvalidRunId" });
    }

    const run = await options.repository.getRun(id);

    if (!run) {
      return reply.code(404).send({ error: "RunNotFound" });
    }

    return reply.send(run satisfies RunState);
  });

  app.get("/runs/:id/events", async (request, reply) => {
    const id = parseRunId(request.params);

    if (!id) {
      return reply.code(400).send({ error: "InvalidRunId" });
    }

    const run = await options.repository.getRun(id);

    if (!run) {
      return reply.code(404).send({ error: "RunNotFound" });
    }

    const events = await options.repository.listRunEvents(id);
    return reply.send(events);
  });

  app.get("/runs/:id/result", async (request, reply) => {
    const id = parseRunId(request.params);

    if (!id) {
      return reply.code(400).send({ error: "InvalidRunId" });
    }

    const run = await options.repository.getRun(id);

    if (!run) {
      return reply.code(404).send({ error: "RunNotFound" });
    }

    const result = await options.repository.getRunResult(id);

    if (!result) {
      return reply.code(404).send({ error: "RunResultNotFound" });
    }

    return reply.send(result satisfies RunResult);
  });

  return app;
}

function parseRunId(params: unknown): string | null {
  const rawId = params && typeof params === "object" ? (params as { id?: unknown }).id : undefined;
  const parsed = NonEmptyStringSchema.safeParse(rawId);
  return parsed.success ? parsed.data : null;
}

type ParsedListRunsQuery =
  | {
      ok: true;
      value: ListRunsOptions;
    }
  | {
      ok: false;
      message: string;
    };

function parseListRunsQuery(query: unknown): ParsedListRunsQuery {
  if (query !== undefined && (!query || typeof query !== "object" || Array.isArray(query))) {
    return {
      ok: false,
      message: "Query string must be an object.",
    };
  }

  const rawQuery = (query ?? {}) as Record<string, unknown>;
  const supportedKeys = new Set(["limit", "status"]);
  const unsupportedKey = Object.keys(rawQuery).find((key) => !supportedKeys.has(key));

  if (unsupportedKey) {
    return {
      ok: false,
      message: `Unsupported query parameter: ${unsupportedKey}.`,
    };
  }

  const parsedLimit = parseRunListLimit(rawQuery.limit);

  if (!parsedLimit.ok) {
    return parsedLimit;
  }

  const parsedStatus = parseRunListStatus(rawQuery.status);

  if (!parsedStatus.ok) {
    return parsedStatus;
  }

  return {
    ok: true,
    value: {
      limit: parsedLimit.value,
      ...(parsedStatus.value ? { status: parsedStatus.value } : {}),
    },
  };
}

function parseRunListLimit(rawLimit: unknown):
  | {
      ok: true;
      value: number;
    }
  | {
      ok: false;
      message: string;
    } {
  if (rawLimit === undefined) {
    return {
      ok: true,
      value: DEFAULT_RUN_LIST_LIMIT,
    };
  }

  if (typeof rawLimit !== "string" || rawLimit.trim() === "") {
    return {
      ok: false,
      message: "limit must be an integer query parameter.",
    };
  }

  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RUN_LIST_LIMIT) {
    return {
      ok: false,
      message: `limit must be an integer from 1 to ${MAX_RUN_LIST_LIMIT}.`,
    };
  }

  return {
    ok: true,
    value: limit,
  };
}

function parseRunListStatus(rawStatus: unknown):
  | {
      ok: true;
      value?: RunStatus;
    }
  | {
      ok: false;
      message: string;
    } {
  if (rawStatus === undefined) {
    return {
      ok: true,
    };
  }

  if (typeof rawStatus !== "string") {
    return {
      ok: false,
      message: "status must be a string query parameter.",
    };
  }

  const parsed = RunStatusSchema.safeParse(rawStatus);

  if (!parsed.success) {
    return {
      ok: false,
      message: "status must be one of queued, running, completed, failed, or cancelled.",
    };
  }

  return {
    ok: true,
    value: parsed.data,
  };
}
