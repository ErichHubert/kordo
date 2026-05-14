import { z } from "zod";

export const packageName = "@kordo/contracts";

export const TimestampSchema = z.string().datetime();

export const NonEmptyStringSchema = z.string().min(1);

export const RunIdSchema = NonEmptyStringSchema;

export const RunnerJobIdSchema = NonEmptyStringSchema;

export const WorkflowIdSchema = NonEmptyStringSchema;

export const GatewayRouteIdSchema = NonEmptyStringSchema;

export const ArtifactIdSchema = NonEmptyStringSchema;

export const RunStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);

export const PhaseStatusSchema = z.enum(["started", "completed", "failed"]);

export const RunnerJobStatusSchema = z.enum(["completed", "failed"]);

export const SandboxBackendSchema = z.enum(["docker-local", "microvm"]);

export const RunInputSourceSchema = z.enum(["manual", "github", "scheduled"]);

export const ArtifactKindSchema = z.enum([
  "log",
  "patch",
  "report",
  "test-report",
  "summary",
  "other",
]);

export const WorkspaceRefSchema = z
  .object({
    kind: z.enum(["git", "archive", "local"]),
    repositoryUrl: z.string().url().optional(),
    ref: NonEmptyStringSchema.optional(),
    path: NonEmptyStringSchema.optional(),
  })
  .strict();

export const RunInputSchema = z
  .object({
    source: RunInputSourceSchema,
    externalId: NonEmptyStringSchema.optional(),
    title: NonEmptyStringSchema,
    body: z.string().optional(),
  })
  .strict();

export const RunRequestSchema = z
  .object({
    workflowId: WorkflowIdSchema,
    input: RunInputSchema,
    workspace: WorkspaceRefSchema.optional(),
    sandboxProfile: NonEmptyStringSchema,
    allowedGatewayRoutes: z.array(GatewayRouteIdSchema),
  })
  .strict();

export const ArtifactRefSchema = z
  .object({
    id: ArtifactIdSchema,
    kind: ArtifactKindSchema,
    name: NonEmptyStringSchema,
    uri: NonEmptyStringSchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    createdAt: TimestampSchema,
  })
  .strict();

export const FailureReasonSchema = z
  .object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  })
  .strict();

export const RunStateSchema = z
  .object({
    id: RunIdSchema,
    workflowId: WorkflowIdSchema,
    status: RunStatusSchema,
    currentPhase: NonEmptyStringSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    runnerJobId: RunnerJobIdSchema.nullable(),
    artifacts: z.array(ArtifactRefSchema),
    failureReason: FailureReasonSchema.optional(),
  })
  .strict();

export const CommandPlanSchema = z
  .object({
    argv: z.array(NonEmptyStringSchema).min(1),
    cwd: NonEmptyStringSchema.optional(),
    timeoutMs: z.number().int().positive().max(600_000),
  })
  .strict();

export const SandboxConfigSchema = z
  .object({
    backend: SandboxBackendSchema,
    profile: NonEmptyStringSchema,
    image: NonEmptyStringSchema,
  })
  .strict();

export const EnvironmentPolicySchema = z
  .object({
    allowNetwork: z.boolean(),
    allowedEnv: z.array(NonEmptyStringSchema),
  })
  .strict();

export const RunnerJobSchema = z
  .object({
    id: RunnerJobIdSchema,
    runId: RunIdSchema,
    workflowId: WorkflowIdSchema,
    sandbox: SandboxConfigSchema,
    command: CommandPlanSchema,
    workspace: WorkspaceRefSchema.optional(),
    environmentPolicy: EnvironmentPolicySchema,
    allowedGatewayRoutes: z.array(GatewayRouteIdSchema),
    createdAt: TimestampSchema,
  })
  .strict();

export const PhaseEventSchema = z
  .object({
    id: NonEmptyStringSchema,
    runId: RunIdSchema,
    phase: NonEmptyStringSchema,
    status: PhaseStatusSchema,
    message: z.string().optional(),
    artifactIds: z.array(ArtifactIdSchema),
    occurredAt: TimestampSchema,
  })
  .strict();

export const ArtifactManifestSchema = z
  .object({
    runId: RunIdSchema,
    generatedAt: TimestampSchema,
    artifacts: z.array(ArtifactRefSchema),
    summary: z.string().optional(),
  })
  .strict();

export const SandboxCleanupResultSchema = z
  .object({
    removed: z.boolean(),
    message: z.string().optional(),
  })
  .strict();

export const SandboxExecutionResultSchema = z
  .object({
    containerName: NonEmptyStringSchema,
    command: z.array(NonEmptyStringSchema).min(1),
    exitCode: z.number().int().nonnegative(),
    stdout: z.string(),
    stderr: z.string(),
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
    durationMs: z.number().int().nonnegative(),
    timedOut: z.boolean(),
    cleanup: SandboxCleanupResultSchema,
  })
  .strict();

export const RunnerJobResultSchema = z
  .object({
    id: RunnerJobIdSchema,
    runId: RunIdSchema,
    status: RunnerJobStatusSchema,
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
    execution: SandboxExecutionResultSchema,
    artifactManifest: ArtifactManifestSchema,
    summary: z.string().optional(),
    failureReason: FailureReasonSchema.optional(),
  })
  .strict();

export type Timestamp = z.infer<typeof TimestampSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export type RunnerJobStatus = z.infer<typeof RunnerJobStatusSchema>;
export type SandboxBackend = z.infer<typeof SandboxBackendSchema>;
export type RunInputSource = z.infer<typeof RunInputSourceSchema>;
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;
export type WorkspaceRef = z.infer<typeof WorkspaceRefSchema>;
export type RunInput = z.infer<typeof RunInputSchema>;
export type RunRequest = z.infer<typeof RunRequestSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type FailureReason = z.infer<typeof FailureReasonSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
export type CommandPlan = z.infer<typeof CommandPlanSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type EnvironmentPolicy = z.infer<typeof EnvironmentPolicySchema>;
export type RunnerJob = z.infer<typeof RunnerJobSchema>;
export type PhaseEvent = z.infer<typeof PhaseEventSchema>;
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export type SandboxCleanupResult = z.infer<typeof SandboxCleanupResultSchema>;
export type SandboxExecutionResult = z.infer<typeof SandboxExecutionResultSchema>;
export type RunnerJobResult = z.infer<typeof RunnerJobResultSchema>;
