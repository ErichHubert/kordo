import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalArtifactStore } from "./local-artifact-store.js";

describe("LocalArtifactStore", () => {
  it("writes and reads artifact content with metadata", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "kordo-artifacts-"));
    const artifactStore = createLocalArtifactStore(rootDir);

    const artifact = await artifactStore.writeArtifact({
      runId: "run_123",
      kind: "log",
      name: "stdout.log",
      content: "hello\n",
      contentType: "text/plain; charset=utf-8",
      createdAt: new Date("2026-05-14T20:00:00.000Z"),
    });
    const storedArtifact = await artifactStore.readArtifact("run_123", artifact);

    expect(artifact).toMatchObject({
      kind: "log",
      name: "stdout.log",
      uri: "artifact://runs/run_123/stdout.log",
      sha256: "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03",
      sizeBytes: 6,
      createdAt: "2026-05-14T20:00:00.000Z",
    });
    expect(storedArtifact).toMatchObject({
      artifact,
      contentType: "text/plain; charset=utf-8",
    });
    expect(storedArtifact?.content.toString("utf8")).toBe("hello\n");
  });

  it("returns null when artifact content is missing", async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "kordo-artifacts-"));
    const artifactStore = createLocalArtifactStore(rootDir);
    const artifact = await artifactStore.writeArtifact({
      runId: "run_123",
      kind: "log",
      name: "stdout.log",
      content: "hello\n",
      contentType: "text/plain; charset=utf-8",
    });

    expect(await artifactStore.readArtifact("run_missing", artifact)).toBeNull();
  });
});
