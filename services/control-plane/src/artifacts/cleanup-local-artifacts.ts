import { cleanupExpiredArtifacts } from "./artifact-cleanup.js";
import { createLocalArtifactStore } from "./local-artifact-store.js";
import { readConfig } from "../config.js";
import { createPostgresRunRepository } from "../repositories/postgres-run-repository.js";

async function main(): Promise<void> {
  const config = readConfig();
  const repository = createPostgresRunRepository(config.databaseUrl);

  try {
    const summary = await cleanupExpiredArtifacts({
      artifactStore: createLocalArtifactStore(config.artifactDir),
      batchSize: config.artifactCleanupBatchSize,
      repository,
      retentionDays: config.artifactRetentionDays,
    });

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await repository.close?.();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
