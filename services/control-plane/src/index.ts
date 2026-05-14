import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { createLocalArtifactStore } from "./artifacts/local-artifact-store.js";
import { readConfig } from "./config.js";
import { createPostgresRunRepository } from "./repositories/postgres-run-repository.js";
import { HttpRunnerClient } from "./runner-client.js";

export const serviceName = "@kordo/control-plane";

export async function start(): Promise<void> {
  const config = readConfig();
  const repository = createPostgresRunRepository(config.databaseUrl);
  const runnerClient = new HttpRunnerClient(config.runnerBaseUrl);
  const app = buildApp({
    artifactStore: createLocalArtifactStore(config.artifactDir),
    logger: true,
    repository,
    runnerClient,
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
