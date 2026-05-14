import { createHash, randomUUID } from "node:crypto";

import { ArtifactRefSchema, type ArtifactRef } from "@kordo/contracts";

import type { ArtifactStore, StoredArtifact, WriteArtifactInput } from "./artifact-store.js";

export class InMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, StoredArtifact>();

  async writeArtifact(input: WriteArtifactInput): Promise<ArtifactRef> {
    const content = Buffer.isBuffer(input.content)
      ? Buffer.from(input.content)
      : Buffer.from(input.content, "utf8");
    const artifact = ArtifactRefSchema.parse({
      id: `artifact_${randomUUID()}`,
      kind: input.kind,
      name: input.name,
      uri: createArtifactUri(input.runId, input.name),
      sha256: createSha256(content),
      sizeBytes: content.byteLength,
      createdAt: (input.createdAt ?? new Date()).toISOString(),
    });

    this.artifacts.set(createArtifactKey(input.runId, artifact.id), {
      artifact,
      content,
      contentType: input.contentType,
    });

    return artifact;
  }

  async readArtifact(runId: string, artifact: ArtifactRef): Promise<StoredArtifact | null> {
    const stored = this.artifacts.get(createArtifactKey(runId, artifact.id));

    if (!stored) {
      return null;
    }

    return {
      artifact: ArtifactRefSchema.parse(stored.artifact),
      content: Buffer.from(stored.content),
      contentType: stored.contentType,
    };
  }
}

export function createInMemoryArtifactStore(): ArtifactStore {
  return new InMemoryArtifactStore();
}

function createArtifactUri(runId: string, artifactName: string): string {
  return `artifact://runs/${runId}/${encodeURIComponent(artifactName)}`;
}

function createArtifactKey(runId: string, artifactId: string): string {
  return `${runId}:${artifactId}`;
}

function createSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
