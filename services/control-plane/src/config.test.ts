import { describe, expect, it } from "vitest";

import {
  DEFAULT_ARTIFACT_CLEANUP_BATCH_SIZE,
  DEFAULT_ARTIFACT_RETENTION_DAYS,
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
  });

  it("reads artifact retention and limits from the environment", () => {
    const config = readConfig({
      KORDO_ARTIFACT_CLEANUP_BATCH_SIZE: "25",
      KORDO_ARTIFACT_RETENTION_DAYS: "14",
      KORDO_MAX_ARTIFACT_BYTES: "1000",
      KORDO_MAX_RUN_ARTIFACT_BYTES: "5000",
    });

    expect(config.artifactCleanupBatchSize).toBe(25);
    expect(config.artifactLimits).toEqual({
      maxArtifactBytes: 1000,
      maxRunArtifactBytes: 5000,
    });
    expect(config.artifactRetentionDays).toBe(14);
  });

  it("rejects invalid artifact limits", () => {
    expect(() =>
      readConfig({
        KORDO_MAX_ARTIFACT_BYTES: "0",
      }),
    ).toThrow("Invalid KORDO_MAX_ARTIFACT_BYTES");
  });
});
