import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { NonEmptyStringSchema, RunnerJobSchema } from "@kordo/contracts";

import type { RunnerJobRepository } from "./jobs.js";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  repository: RunnerJobRepository;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.post("/jobs", async (request, reply) => {
    const parsed = RunnerJobSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "InvalidRunnerJob",
        issues: parsed.error.issues,
      });
    }

    const result = await options.repository.createJob(parsed.data);
    return reply.code(201).send(result);
  });

  app.get("/jobs/:id", async (request, reply) => {
    const id = parseJobId(request.params);

    if (!id) {
      return reply.code(400).send({ error: "InvalidRunnerJobId" });
    }

    const job = await options.repository.getJob(id);

    if (!job) {
      return reply.code(404).send({ error: "RunnerJobNotFound" });
    }

    return reply.send(job);
  });

  return app;
}

function parseJobId(params: unknown): string | null {
  const rawId = params && typeof params === "object" ? (params as { id?: unknown }).id : undefined;
  const parsed = NonEmptyStringSchema.safeParse(rawId);
  return parsed.success ? parsed.data : null;
}
