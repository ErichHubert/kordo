import type { ArtifactKind, ArtifactRef } from "@kordo/contracts";

export interface WriteArtifactInput {
  content: Buffer | string;
  contentType: string;
  createdAt?: Date;
  kind: ArtifactKind;
  name: string;
  runId: string;
}

export interface StoredArtifact {
  artifact: ArtifactRef;
  content: Buffer;
  contentType: string;
}

export interface ArtifactStore {
  readArtifact(runId: string, artifact: ArtifactRef): Promise<StoredArtifact | null>;
  writeArtifact(input: WriteArtifactInput): Promise<ArtifactRef>;
}
