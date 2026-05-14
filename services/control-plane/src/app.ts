import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import {
  NonEmptyStringSchema,
  RunRequestSchema,
  type RunResult,
  type RunState,
} from "@kordo/contracts";

import type { RunRepository } from "./repositories/run-repository.js";
import type { RunnerClient } from "./runner-client.js";
import { createRunnerJob } from "./runner-jobs.js";

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
