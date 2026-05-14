import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import {
  NonEmptyStringSchema,
  RunRequestSchema,
  type RunResult,
  type RunState,
} from "@kordo/contracts";

import type { RunRepository } from "./repositories/run-repository.js";
import { createRunnerJob } from "./runner-jobs.js";
import { createInProcessRunDispatcher, type RunDispatcher } from "./run-dispatcher.js";
import { parseRunListQuery } from "./run-list-query.js";
import type { RunnerClient } from "./runner-client.js";

export interface BuildAppOptions {
  dispatcher?: RunDispatcher;
  logger?: FastifyServerOptions["logger"];
  repository: RunRepository;
  runnerClient?: RunnerClient;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const dispatcher = createRunDispatcher(options, app.log);

  app.addHook("onClose", async () => {
    await dispatcher.close?.();
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

    try {
      dispatcher.dispatch(runnerJob);
      return reply.code(202).send(result.run);
    } catch (error) {
      request.log.error({ error, runId: result.run.id }, "Run dispatch scheduling failed");

      const failedRun = await options.repository.failRun(
        result.run.id,
        runnerJob.id,
        {
          code: "RunnerDispatchFailed",
          message: error instanceof Error ? error.message : "Runner dispatch failed.",
        },
        "Run dispatch scheduling failed.",
      );

      return reply.code(500).send(failedRun);
    }
  });

  app.get("/runs", async (request, reply) => {
    const parsed = parseRunListQuery(request.query);

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

function createRunDispatcher(
  options: BuildAppOptions,
  logger: FastifyInstance["log"],
): RunDispatcher {
  if (options.dispatcher) {
    return options.dispatcher;
  }

  if (!options.runnerClient) {
    throw new Error("runnerClient is required when dispatcher is not provided.");
  }

  return createInProcessRunDispatcher({
    logger,
    repository: options.repository,
    runnerClient: options.runnerClient,
  });
}

function parseRunId(params: unknown): string | null {
  const rawId = params && typeof params === "object" ? (params as { id?: unknown }).id : undefined;
  const parsed = NonEmptyStringSchema.safeParse(rawId);
  return parsed.success ? parsed.data : null;
}
