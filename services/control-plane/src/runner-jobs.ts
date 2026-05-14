import { randomUUID } from "node:crypto";

import { RunnerJobSchema, type RunRequest, type RunState, type RunnerJob } from "@kordo/contracts";

export function createRunnerJob(run: RunState, request: RunRequest, now = new Date()): RunnerJob {
  return RunnerJobSchema.parse({
    id: `job_${randomUUID()}`,
    runId: run.id,
    workflowId: request.workflowId,
    sandbox: {
      backend: "docker-local",
      profile: request.sandboxProfile,
      image: "node:24-alpine",
    },
    command: {
      argv: ["node", "--version"],
      timeoutMs: 30_000,
    },
    ...(request.workspace ? { workspace: request.workspace } : {}),
    environmentPolicy: {
      allowNetwork: false,
      allowedEnv: [],
    },
    allowedGatewayRoutes: request.allowedGatewayRoutes,
    createdAt: now.toISOString(),
  });
}
