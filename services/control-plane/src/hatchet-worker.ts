import { pathToFileURL } from "node:url";

import { createLocalArtifactStore } from "./artifacts/local-artifact-store.js";
import { readConfig } from "./config.js";
import { createKordoHatchetClient } from "./hatchet/client.js";
import { createKordoHatchetWorkflows } from "./hatchet/workflows.js";
import { createPostgresRunRepository } from "./repositories/postgres-run-repository.js";
import { HttpRunnerClient } from "./runner-client.js";

export async function startHatchetWorker(): Promise<void> {
  const config = readConfig();
  const repository = createPostgresRunRepository(config.databaseUrl);
  const runnerClient = new HttpRunnerClient(config.runnerBaseUrl);
  const artifactStore = createLocalArtifactStore(config.artifactDir);
  const hatchet = createKordoHatchetClient(config.hatchet.client);
  const workflows = createKordoHatchetWorkflows({
    artifactCleanupBatchSize: config.artifactCleanupBatchSize,
    artifactCleanupCron: config.hatchet.artifactCleanupCron,
    artifactLimits: config.artifactLimits,
    artifactRetentionDays: config.artifactRetentionDays,
    artifactStore,
    hatchet,
    repository,
    runnerClient,
  });
  const worker = await hatchet.worker(config.hatchet.workerName, {
    handleKill: true,
    slots: config.hatchet.workerSlots,
    workflows,
  });

  await worker.start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHatchetWorker().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
