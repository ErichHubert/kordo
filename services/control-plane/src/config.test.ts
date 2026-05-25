import { describe, expect, it } from "vitest";

import {
  DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE,
  DEFAULT_ARTIFACT_RETENTION_DAYS,
  DEFAULT_ALLOWED_GATEWAY_ROUTES,
  DEFAULT_ALLOWED_SANDBOX_PROFILES,
  DEFAULT_INNGEST_APP_ID,
  DEFAULT_INNGEST_SERVE_PATH,
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
    expect(config.inngest).toEqual({
      appId: DEFAULT_INNGEST_APP_ID,
      dev: true,
      servePath: DEFAULT_INNGEST_SERVE_PATH,
    });
    expect(config.runPolicy).toEqual({
      allowedGatewayRoutes: DEFAULT_ALLOWED_GATEWAY_ROUTES,
      allowedSandboxProfiles: DEFAULT_ALLOWED_SANDBOX_PROFILES,
    });
  });

  it("reads artifact retention, limits, Inngest, and run policy from the environment", () => {
    const config = readConfig({
      KORDO_ARTIFACT_CLEANUP_BATCH_SIZE: "25",
      KORDO_ARTIFACT_RETENTION_DAYS: "14",
      KORDO_ALLOWED_GATEWAY_ROUTES: "github.issues.write, stripe.customers.create",
      KORDO_ALLOWED_SANDBOX_PROFILES: "docker-local-default, microvm-default",
      KORDO_INNGEST_APP_ID: "kordo-test",
      KORDO_INNGEST_BASE_URL: "http://127.0.0.1:8288",
      KORDO_INNGEST_DEV: "false",
      KORDO_INNGEST_EVENT_KEY: "event-key",
      KORDO_INNGEST_SERVE_ORIGIN: "http://127.0.0.1:4100",
      KORDO_INNGEST_SERVE_PATH: "/custom/inngest",
      KORDO_INNGEST_SIGNING_KEY: "signing-key",
      KORDO_MAX_ARTIFACT_BYTES: "1000",
      KORDO_MAX_RUN_ARTIFACT_BYTES: "5000",
    });

    expect(config.artifactCleanupBatchSize).toBe(25);
    expect(config.artifactLimits).toEqual({
      maxArtifactBytes: 1000,
      maxRunArtifactBytes: 5000,
    });
    expect(config.artifactRetentionDays).toBe(14);
    expect(config.inngest).toEqual({
      appId: "kordo-test",
      baseUrl: "http://127.0.0.1:8288",
      dev: false,
      eventKey: "event-key",
      serveOrigin: "http://127.0.0.1:4100",
      servePath: "/custom/inngest",
      signingKey: "signing-key",
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

  it("rejects invalid Inngest dev config", () => {
    expect(() =>
      readConfig({
        KORDO_INNGEST_DEV: "maybe",
      }),
    ).toThrow("Invalid KORDO_INNGEST_DEV");
  });
});
