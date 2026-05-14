import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  ArtifactRefSchema,
  PhaseEventSchema,
  RunRequestSchema,
  RunStateSchema,
  RunnerJobResultSchema,
  RunnerJobSchema,
  packageName,
  type ArtifactManifest,
  type ArtifactRef,
  type PhaseEvent,
  type RunRequest,
  type RunState,
  type RunnerJobResult,
  type RunnerJob,
} from "./index.js";

const timestamp = "2026-05-14T15:00:00.000Z";

const artifactRef: ArtifactRef = {
  id: "artifact_123",
  kind: "log",
  name: "stdout.log",
  uri: "artifact://runs/run_123/stdout.log",
  sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sizeBytes: 128,
  createdAt: timestamp,
};

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    externalId: "issue-123",
    title: "Fix failing login test",
    body: "The login test fails against the local fixture.",
  },
  workspace: {
    kind: "git",
    repositoryUrl: "https://github.com/example/app.git",
    ref: "main",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: ["stripe.customers.create"],
};

const runState: RunState = {
  id: "run_123",
  workflowId: runRequest.workflowId,
  status: "running",
  currentPhase: "unit_test",
  createdAt: timestamp,
  updatedAt: timestamp,
  runnerJobId: "job_123",
  artifacts: [artifactRef],
};

const runnerJob: RunnerJob = {
  id: "job_123",
  runId: runState.id,
  workflowId: runState.workflowId,
  sandbox: {
    backend: "docker-local",
    profile: "docker-local-default",
    image: "node:24-alpine",
  },
  command: {
    argv: ["node", "--version"],
    cwd: "/workspace",
    timeoutMs: 30_000,
  },
  workspace: runRequest.workspace,
  environmentPolicy: {
    allowNetwork: false,
    allowedEnv: ["NODE_ENV"],
  },
  allowedGatewayRoutes: runRequest.allowedGatewayRoutes,
  createdAt: timestamp,
};

const phaseEvent: PhaseEvent = {
  id: "event_123",
  runId: runState.id,
  phase: "unit_test",
  status: "completed",
  message: "Unit tests completed.",
  artifactIds: [artifactRef.id],
  occurredAt: timestamp,
};

const artifactManifest: ArtifactManifest = {
  runId: runState.id,
  generatedAt: timestamp,
  artifacts: [artifactRef],
  summary: "Captured stdout from the sandbox command.",
};

const runnerJobResult: RunnerJobResult = {
  id: runnerJob.id,
  runId: runnerJob.runId,
  status: "completed",
  startedAt: timestamp,
  completedAt: timestamp,
  artifactManifest,
  summary: "Runner stub completed.",
};

describe("@kordo/contracts", () => {
  it("exports the package name", () => {
    expect(packageName).toBe("@kordo/contracts");
  });

  it("accepts a valid RunRequest", () => {
    expect(RunRequestSchema.parse(runRequest)).toEqual(runRequest);
  });

  it("rejects a RunRequest without a workflow id", () => {
    expect(RunRequestSchema.safeParse({ ...runRequest, workflowId: "" }).success).toBe(false);
  });

  it("rejects unknown RunRequest keys", () => {
    expect(RunRequestSchema.safeParse({ ...runRequest, unexpected: true }).success).toBe(false);
  });

  it("accepts a valid RunState", () => {
    expect(RunStateSchema.parse(runState)).toEqual(runState);
  });

  it("rejects a RunState with an unsupported status", () => {
    expect(RunStateSchema.safeParse({ ...runState, status: "waiting" }).success).toBe(false);
  });

  it("accepts a valid RunnerJob", () => {
    expect(RunnerJobSchema.parse(runnerJob)).toEqual(runnerJob);
  });

  it("rejects a RunnerJob without a command argv", () => {
    expect(
      RunnerJobSchema.safeParse({
        ...runnerJob,
        command: { ...runnerJob.command, argv: [] },
      }).success,
    ).toBe(false);
  });

  it("accepts a valid PhaseEvent", () => {
    expect(PhaseEventSchema.parse(phaseEvent)).toEqual(phaseEvent);
  });

  it("rejects a PhaseEvent with an unsupported status", () => {
    expect(PhaseEventSchema.safeParse({ ...phaseEvent, status: "running" }).success).toBe(false);
  });

  it("accepts a valid ArtifactManifest", () => {
    expect(ArtifactManifestSchema.parse(artifactManifest)).toEqual(artifactManifest);
  });

  it("rejects an ArtifactRef with an invalid checksum", () => {
    expect(ArtifactRefSchema.safeParse({ ...artifactRef, sha256: "not-a-checksum" }).success).toBe(
      false,
    );
  });

  it("accepts a valid RunnerJobResult", () => {
    expect(RunnerJobResultSchema.parse(runnerJobResult)).toEqual(runnerJobResult);
  });

  it("rejects a RunnerJobResult with an unsupported status", () => {
    expect(RunnerJobResultSchema.safeParse({ ...runnerJobResult, status: "running" }).success).toBe(
      false,
    );
  });
});
