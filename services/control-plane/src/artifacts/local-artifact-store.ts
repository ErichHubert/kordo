import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { ArtifactRefSchema, type ArtifactRef } from "@kordo/contracts";

import type {
  ArtifactStore,
  DeleteArtifactResult,
  StoredArtifact,
  WriteArtifactInput,
} from "./artifact-store.js";

export class LocalArtifactStore implements ArtifactStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

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
      ...(input.originalSizeBytes !== undefined
        ? { originalSizeBytes: input.originalSizeBytes }
        : {}),
      ...(input.truncated !== undefined ? { truncated: input.truncated } : {}),
      createdAt: (input.createdAt ?? new Date()).toISOString(),
    });
    const artifactPath = this.createArtifactPath(input.runId, artifact.id);

    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, content);

    return artifact;
  }

  async readArtifact(runId: string, artifact: ArtifactRef): Promise<StoredArtifact | null> {
    try {
      const content = await readFile(this.createArtifactPath(runId, artifact.id));

      return {
        artifact,
        content,
        contentType: "text/plain; charset=utf-8",
      };
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) {
        return null;
      }

      throw error;
    }
  }

  async deleteArtifact(runId: string, artifact: ArtifactRef): Promise<DeleteArtifactResult> {
    const artifactPath = this.createArtifactPath(runId, artifact.id);

    try {
      await unlink(artifactPath);
      await removeEmptyDirectory(path.dirname(artifactPath));
      return { status: "deleted" };
    } catch (error) {
      if (isNodeErrorCode(error, "ENOENT")) {
        return { status: "missing" };
      }

      throw error;
    }
  }

  private createArtifactPath(runId: string, artifactId: string): string {
    const artifactPath = path.resolve(this.rootDir, sanitizePathSegment(runId), artifactId);

    if (!artifactPath.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new Error("Artifact path escaped artifact root.");
    }

    return artifactPath;
  }
}

export function createLocalArtifactStore(rootDir: string): ArtifactStore {
  return new LocalArtifactStore(rootDir);
}

function createArtifactUri(runId: string, artifactName: string): string {
  return `artifact://runs/${runId}/${encodeURIComponent(artifactName)}`;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

function createSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function removeEmptyDirectory(directory: string): Promise<void> {
  try {
    await rmdir(directory);
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT") || isNodeErrorCode(error, "ENOTEMPTY")) {
      return;
    }

    throw error;
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
