import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { createLocalArtifactStore } from "./artifacts/local-artifact-store.js";
import { readConfig } from "./config.js";
import { createKordoHatchetClient } from "./hatchet/client.js";
import { createHatchetRunDispatcher } from "./hatchet/run-dispatcher.js";
import { createPostgresRunRepository } from "./repositories/postgres-run-repository.js";

export const serviceName = "@kordo/control-plane";

export async function start(): Promise<void> {
  const config = readConfig();
  const repository = createPostgresRunRepository(config.databaseUrl);
  const artifactStore = createLocalArtifactStore(config.artifactDir);
  const hatchet = createKordoHatchetClient(config.hatchet.client);
  const app = buildApp({
    artifactStore,
    dispatcher: createHatchetRunDispatcher({ eventPublisher: hatchet.events }),
    logger: true,
    repository,
    runPolicy: config.runPolicy,
  });

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
