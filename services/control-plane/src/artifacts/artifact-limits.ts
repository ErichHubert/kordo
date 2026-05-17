export interface ArtifactLimits {
  maxArtifactBytes: number;
  maxRunArtifactBytes: number;
}

export const DEFAULT_ARTIFACT_LIMITS: ArtifactLimits = {
  maxArtifactBytes: 10 * 1024 * 1024,
  maxRunArtifactBytes: 50 * 1024 * 1024,
};

export class ArtifactLimitExceededError extends Error {
  readonly code = "ArtifactLimitExceeded";

  constructor(message: string) {
    super(message);
    this.name = "ArtifactLimitExceededError";
  }
}

export function normalizeArtifactLimits(limits?: Partial<ArtifactLimits>): ArtifactLimits {
  const normalized = {
    ...DEFAULT_ARTIFACT_LIMITS,
    ...limits,
  };

  assertPositiveInteger("maxArtifactBytes", normalized.maxArtifactBytes);
  assertPositiveInteger("maxRunArtifactBytes", normalized.maxRunArtifactBytes);

  return normalized;
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}
