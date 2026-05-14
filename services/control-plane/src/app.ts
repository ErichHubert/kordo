import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { NonEmptyStringSchema, RunRequestSchema, type RunState } from "@kordo/contracts";

import type { RunRepository } from "./repositories/run-repository.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  repository: RunRepository;
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
    return reply.code(201).send(result.run);
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

  return app;
}

function parseRunId(params: unknown): string | null {
  const rawId = params && typeof params === "object" ? (params as { id?: unknown }).id : undefined;
  const parsed = NonEmptyStringSchema.safeParse(rawId);
  return parsed.success ? parsed.data : null;
}
