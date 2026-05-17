import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import {
  NonEmptyStringSchema,
  RunRequestSchema,
  type RunResult,
  type RunState,
} from "@kordo/contracts";
import { validateRunRequestPolicy, type RunPolicy } from "@kordo/policy";

import type { ArtifactLimits } from "./artifacts/artifact-limits.js";
import type { ArtifactStore } from "./artifacts/artifact-store.js";
import type { RunRepository } from "./repositories/run-repository.js";
import { createRunnerJob } from "./runner-jobs.js";
import { createInProcessRunDispatcher, type RunDispatcher } from "./run-dispatcher.js";
import { parseRunListQuery } from "./run-list-query.js";
import type { RunnerClient } from "./runner-client.js";

export interface BuildAppOptions {
  artifactLimits?: Partial<ArtifactLimits>;
  artifactStore: ArtifactStore;
  dispatcher?: RunDispatcher;
  logger?: FastifyServerOptions["logger"];
  repository: RunRepository;
  runPolicy: RunPolicy;
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

    const policyResult = validateRunRequestPolicy(parsed.data, options.runPolicy);

    if (!policyResult.ok) {
      return reply.code(400).send({
        error: "RunPolicyRejected",
        code: policyResult.code,
        message: policyResult.message,
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

  app.get("/runs/:id/artifacts/:artifactId", async (request, reply) => {
    const ids = parseArtifactRouteParams(request.params);

    if (!ids) {
      return reply.code(400).send({ error: "InvalidArtifactRequest" });
    }

    const run = await options.repository.getRun(ids.runId);

    if (!run) {
      return reply.code(404).send({ error: "RunNotFound" });
    }

    const artifact = run.artifacts.find((candidate) => candidate.id === ids.artifactId);

    if (!artifact) {
      return reply.code(404).send({ error: "ArtifactNotFound" });
    }

    const storedArtifact = await options.artifactStore.readArtifact(ids.runId, artifact);

    if (!storedArtifact) {
      return reply.code(404).send({ error: "ArtifactContentNotFound" });
    }

    return reply
      .header("content-type", storedArtifact.contentType)
      .header("x-kordo-artifact-id", storedArtifact.artifact.id)
      .send(storedArtifact.content);
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
    ...(options.artifactLimits ? { artifactLimits: options.artifactLimits } : {}),
    artifactStore: options.artifactStore,
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

function parseArtifactRouteParams(params: unknown): { artifactId: string; runId: string } | null {
  const rawParams =
    params && typeof params === "object"
      ? (params as { artifactId?: unknown; id?: unknown })
      : undefined;
  const parsedRunId = NonEmptyStringSchema.safeParse(rawParams?.id);
  const parsedArtifactId = NonEmptyStringSchema.safeParse(rawParams?.artifactId);

  if (!parsedRunId.success || !parsedArtifactId.success) {
    return null;
  }

  return {
    artifactId: parsedArtifactId.data,
    runId: parsedRunId.data,
  };
}
