import type { RunPolicy } from "@kordo/policy";

import { DEFAULT_ARTIFACT_LIMITS, type ArtifactLimits } from "./artifacts/artifact-limits.js";

export const DEFAULT_DATABASE_URL = "postgres://kordo:kordo@localhost:5432/kordo";

export const DEFAULT_ARTIFACT_RETENTION_DAYS = 7;

export const DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE = 500;

export const DEFAULT_ALLOWED_SANDBOX_PROFILES = ["docker-local-default"] as const;

export const DEFAULT_ALLOWED_GATEWAY_ROUTES = [] as const;

export const DEFAULT_INNGEST_APP_ID = "kordo-control-plane";

export const DEFAULT_INNGEST_SERVE_PATH = "/api/inngest";

export interface InngestConfig {
  appId: string;
  baseUrl?: string;
  dev: boolean;
  eventKey?: string;
  serveOrigin?: string;
  servePath: string;
  signingKey?: string;
}

export interface ControlPlaneConfig {
  artifactDir: string;
  artifactCleanupBatchSize: number;
  artifactLimits: ArtifactLimits;
  artifactRetentionDays: number;
  databaseUrl: string;
  host: string;
  inngest: InngestConfig;
  port: number;
  runPolicy: RunPolicy;
  runnerBaseUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  const inngestBaseUrl = env.KORDO_INNGEST_BASE_URL;
  const inngestEventKey = env.KORDO_INNGEST_EVENT_KEY ?? env.INNGEST_EVENT_KEY;
  const inngestServeOrigin = env.KORDO_INNGEST_SERVE_ORIGIN;
  const inngestSigningKey = env.KORDO_INNGEST_SIGNING_KEY ?? env.INNGEST_SIGNING_KEY;

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
    host: env.CONTROL_PLANE_HOST ?? "0.0.0.0",
    inngest: {
      appId: env.KORDO_INNGEST_APP_ID ?? DEFAULT_INNGEST_APP_ID,
      ...(inngestBaseUrl ? { baseUrl: inngestBaseUrl } : {}),
      dev: readBoolean(env.KORDO_INNGEST_DEV ?? "true", "KORDO_INNGEST_DEV"),
      ...(inngestEventKey ? { eventKey: inngestEventKey } : {}),
      ...(inngestServeOrigin ? { serveOrigin: inngestServeOrigin } : {}),
      servePath: env.KORDO_INNGEST_SERVE_PATH ?? DEFAULT_INNGEST_SERVE_PATH,
      ...(inngestSigningKey ? { signingKey: inngestSigningKey } : {}),
    },
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

function readBoolean(value: string, name: string): boolean {
  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
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
