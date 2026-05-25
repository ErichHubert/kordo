import type { RunPolicy } from "@kordo/policy";

import { DEFAULT_ARTIFACT_LIMITS, type ArtifactLimits } from "./artifacts/artifact-limits.js";

export const DEFAULT_DATABASE_URL = "postgres://kordo:kordo@localhost:5432/kordo";

export const DEFAULT_ARTIFACT_RETENTION_DAYS = 7;

export const DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE = 500;

export const DEFAULT_ALLOWED_SANDBOX_PROFILES = ["docker-local-default"] as const;

export const DEFAULT_ALLOWED_GATEWAY_ROUTES = [] as const;

export const DEFAULT_HATCHET_CLIENT_NAMESPACE = "kordo";

export const DEFAULT_HATCHET_WORKER_NAME = "kordo-control-plane-worker";

export const DEFAULT_HATCHET_WORKER_SLOTS = 10;

export const DEFAULT_HATCHET_ARTIFACT_CLEANUP_CRON = "0 0 * * *";

export type HatchetLogLevel = "OFF" | "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface HatchetClientConfig {
  apiUrl?: string;
  hostPort?: string;
  logLevel?: HatchetLogLevel;
  namespace?: string;
  token?: string;
}

export interface HatchetConfig {
  artifactCleanupCron: string;
  client: HatchetClientConfig;
  workerName: string;
  workerSlots: number;
}

export interface ControlPlaneConfig {
  artifactDir: string;
  artifactCleanupBatchSize: number;
  artifactLimits: ArtifactLimits;
  artifactRetentionDays: number;
  databaseUrl: string;
  hatchet: HatchetConfig;
  host: string;
  port: number;
  runPolicy: RunPolicy;
  runnerBaseUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  const hatchetApiUrl = env.KORDO_HATCHET_CLIENT_API_URL ?? env.HATCHET_CLIENT_API_URL;
  const hatchetHostPort = env.KORDO_HATCHET_CLIENT_HOST_PORT ?? env.HATCHET_CLIENT_HOST_PORT;
  const hatchetLogLevel = env.KORDO_HATCHET_CLIENT_LOG_LEVEL ?? env.HATCHET_CLIENT_LOG_LEVEL;
  const hatchetNamespace =
    env.KORDO_HATCHET_CLIENT_NAMESPACE ??
    env.HATCHET_CLIENT_NAMESPACE ??
    DEFAULT_HATCHET_CLIENT_NAMESPACE;
  const hatchetToken = env.KORDO_HATCHET_CLIENT_TOKEN ?? env.HATCHET_CLIENT_TOKEN;

  return {
    artifactDir: env.KORDO_ARTIFACT_DIR ?? ".kordo/artifacts",
    artifactCleanupBatchSize: readPositiveInteger(
      env.KORDO_ARTIFACT_CLEANUP_BATCH_SIZE ?? String(DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE),
      "KORDO_ARTIFACT_CLEANUP_BATCH_SIZE",
    ),
    artifactLimits: {
      maxArtifactBytes: readPositiveInteger(
        env.KORDO_MAX_ARTIFACT_BYTES ?? String(DEFAULT_ARTIFACT_LIMITS.maxArtifactBytes),
        "KORDO_MAX_ARTIFACT_BYTES",
      ),
      maxRunArtifactBytes: readPositiveInteger(
        env.KORDO_MAX_RUN_ARTIFACT_BYTES ?? String(DEFAULT_ARTIFACT_LIMITS.maxRunArtifactBytes),
        "KORDO_MAX_RUN_ARTIFACT_BYTES",
      ),
    },
    artifactRetentionDays: readPositiveInteger(
      env.KORDO_ARTIFACT_RETENTION_DAYS ?? String(DEFAULT_ARTIFACT_RETENTION_DAYS),
      "KORDO_ARTIFACT_RETENTION_DAYS",
    ),
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    hatchet: {
      artifactCleanupCron:
        env.KORDO_HATCHET_ARTIFACT_CLEANUP_CRON ?? DEFAULT_HATCHET_ARTIFACT_CLEANUP_CRON,
      client: {
        ...(hatchetApiUrl ? { apiUrl: hatchetApiUrl } : {}),
        ...(hatchetHostPort ? { hostPort: hatchetHostPort } : {}),
        ...(hatchetLogLevel
          ? { logLevel: readHatchetLogLevel(hatchetLogLevel, "KORDO_HATCHET_CLIENT_LOG_LEVEL") }
          : {}),
        namespace: hatchetNamespace,
        ...(hatchetToken ? { token: hatchetToken } : {}),
      },
      workerName: env.KORDO_HATCHET_WORKER_NAME ?? DEFAULT_HATCHET_WORKER_NAME,
      workerSlots: readPositiveInteger(
        env.KORDO_HATCHET_WORKER_SLOTS ?? String(DEFAULT_HATCHET_WORKER_SLOTS),
        "KORDO_HATCHET_WORKER_SLOTS",
      ),
    },
    host: env.CONTROL_PLANE_HOST ?? "0.0.0.0",
    port: readPort(env.CONTROL_PLANE_PORT ?? "4100"),
    runPolicy: {
      allowedGatewayRoutes: readStringList(
        env.KORDO_ALLOWED_GATEWAY_ROUTES,
        DEFAULT_ALLOWED_GATEWAY_ROUTES,
      ),
      allowedSandboxProfiles: readRequiredStringList(
        env.KORDO_ALLOWED_SANDBOX_PROFILES,
        "KORDO_ALLOWED_SANDBOX_PROFILES",
        DEFAULT_ALLOWED_SANDBOX_PROFILES,
      ),
    },
    runnerBaseUrl: env.RUNNER_BASE_URL ?? "http://127.0.0.1:4200",
  };
}

function readPort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid CONTROL_PLANE_PORT: ${value}`);
  }

  return port;
}

function readPositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || String(parsed) !== value.trim()) {
    throw new Error(`Invalid ${name}: ${value}`);
  }

  return parsed;
}

function readHatchetLogLevel(value: string, name: string): HatchetLogLevel {
  if (
    value === "OFF" ||
    value === "DEBUG" ||
    value === "INFO" ||
    value === "WARN" ||
    value === "ERROR"
  ) {
    return value;
  }

  throw new Error(`Invalid ${name}: ${value}`);
}

function readStringList(value: string | undefined, defaultValue: readonly string[]): string[] {
  if (value === undefined) {
    return [...defaultValue];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readRequiredStringList(
  value: string | undefined,
  name: string,
  defaultValue: readonly string[],
): string[] {
  const parsed = readStringList(value, defaultValue);

  if (parsed.length === 0) {
    throw new Error(`Invalid ${name}: at least one value is required.`);
  }

  return parsed;
}
