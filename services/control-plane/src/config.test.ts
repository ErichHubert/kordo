import { describe, expect, it } from "vitest";

import {
  DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE,
  DEFAULT_ARTIFACT_RETENTION_DAYS,
  DEFAULT_ALLOWED_GATEWAY_ROUTES,
  DEFAULT_ALLOWED_SANDBOX_PROFILES,
  DEFAULT_HATCHET_ARTIFACT_CLEANUP_CRON,
  DEFAULT_HATCHET_CLIENT_NAMESPACE,
  DEFAULT_ORCHESTRATOR_WORKER_NAME,
  DEFAULT_ORCHESTRATOR_WORKER_SLOTS,
  readConfig,
} from "./config.js";

describe("readConfig", () => {
  it("uses artifact retention and limit defaults", () => {
    const config = readConfig({});

    expect(config.artifactCleanupBatchSize).toBe(DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE);
    expect(config.artifactLimits).toEqual({
      maxArtifactBytes: 10_485_760,
      maxRunArtifactBytes: 52_428_800,
    });
    expect(config.artifactRetentionDays).toBe(DEFAULT_ARTIFACT_RETENTION_DAYS);
    expect(config.hatchet).toEqual({
      artifactCleanupCron: DEFAULT_HATCHET_ARTIFACT_CLEANUP_CRON,
      client: {
        namespace: DEFAULT_HATCHET_CLIENT_NAMESPACE,
      },
      orchestratorWorkerName: DEFAULT_ORCHESTRATOR_WORKER_NAME,
      orchestratorWorkerSlots: DEFAULT_ORCHESTRATOR_WORKER_SLOTS,
    });
    expect(config.runPolicy).toEqual({
      allowedGatewayRoutes: DEFAULT_ALLOWED_GATEWAY_ROUTES,
      allowedSandboxProfiles: DEFAULT_ALLOWED_SANDBOX_PROFILES,
    });
  });

  it("reads artifact retention, limits, Hatchet, and run policy from the environment", () => {
    const config = readConfig({
      KORDO_ARTIFACT_CLEANUP_BATCH_SIZE: "25",
      KORDO_ARTIFACT_RETENTION_DAYS: "14",
      KORDO_ALLOWED_GATEWAY_ROUTES: "github.issues.write, stripe.customers.create",
      KORDO_ALLOWED_SANDBOX_PROFILES: "docker-local-default, microvm-default",
      KORDO_HATCHET_ARTIFACT_CLEANUP_CRON: "*/15 * * * *",
      KORDO_HATCHET_CLIENT_API_URL: "http://127.0.0.1:8888",
      KORDO_HATCHET_CLIENT_HOST_PORT: "127.0.0.1:7077",
      KORDO_HATCHET_CLIENT_LOG_LEVEL: "DEBUG",
      KORDO_HATCHET_CLIENT_NAMESPACE: "kordo-test",
      KORDO_HATCHET_CLIENT_TOKEN: "hatchet-token",
      KORDO_ORCHESTRATOR_WORKER_NAME: "test-orchestrator",
      KORDO_ORCHESTRATOR_WORKER_SLOTS: "3",
      KORDO_MAX_ARTIFACT_BYTES: "1000",
      KORDO_MAX_RUN_ARTIFACT_BYTES: "5000",
    });

    expect(config.artifactCleanupBatchSize).toBe(25);
    expect(config.artifactLimits).toEqual({
      maxArtifactBytes: 1000,
      maxRunArtifactBytes: 5000,
    });
    expect(config.artifactRetentionDays).toBe(14);
    expect(config.hatchet).toEqual({
      artifactCleanupCron: "*/15 * * * *",
      client: {
        apiUrl: "http://127.0.0.1:8888",
        hostPort: "127.0.0.1:7077",
        logLevel: "DEBUG",
        namespace: "kordo-test",
        token: "hatchet-token",
      },
      orchestratorWorkerName: "test-orchestrator",
      orchestratorWorkerSlots: 3,
    });
    expect(config.runPolicy).toEqual({
      allowedGatewayRoutes: ["github.issues.write", "stripe.customers.create"],
      allowedSandboxProfiles: ["docker-local-default", "microvm-default"],
    });
  });

  it("rejects invalid artifact limits", () => {
    expect(() =>
      readConfig({
        KORDO_MAX_ARTIFACT_BYTES: "0",
      }),
    ).toThrow("Invalid KORDO_MAX_ARTIFACT_BYTES");
  });

  it("rejects empty sandbox profile policy config", () => {
    expect(() =>
      readConfig({
        KORDO_ALLOWED_SANDBOX_PROFILES: "",
      }),
    ).toThrow("Invalid KORDO_ALLOWED_SANDBOX_PROFILES");
  });

  it("rejects invalid Hatchet log level config", () => {
    expect(() =>
      readConfig({
        KORDO_HATCHET_CLIENT_LOG_LEVEL: "TRACE",
      }),
    ).toThrow("Invalid KORDO_HATCHET_CLIENT_LOG_LEVEL");
  });

  it("rejects invalid orchestrator worker slot config", () => {
    expect(() =>
      readConfig({
        KORDO_ORCHESTRATOR_WORKER_SLOTS: "0",
      }),
    ).toThrow("Invalid KORDO_ORCHESTRATOR_WORKER_SLOTS");
  });
});
