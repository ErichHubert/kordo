import type { ArtifactKind, ArtifactRef } from "@kordo/contracts";

export interface WriteArtifactInput {
  content: Buffer | string;
  contentType: string;
  createdAt?: Date;
  kind: ArtifactKind;
  name: string;
  originalSizeBytes?: number;
  runId: string;
  truncated?: boolean;
}

export interface StoredArtifact {
  artifact: ArtifactRef;
  content: Buffer;
  contentType: string;
}

export interface DeleteArtifactResult {
  status: "deleted" | "missing";
}

export interface ArtifactStore {
  deleteArtifact(runId: string, artifact: ArtifactRef): Promise<DeleteArtifactResult>;
  readArtifact(runId: string, artifact: ArtifactRef): Promise<StoredArtifact | null>;
  writeArtifact(input: WriteArtifactInput): Promise<ArtifactRef>;
}
