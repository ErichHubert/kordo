import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { createLocalArtifactStore } from "./artifacts/local-artifact-store.js";
import { readConfig } from "./config.js";
import { createKordoInngestClient } from "./inngest/client.js";
import { createKordoInngestFunctions } from "./inngest/functions.js";
import { createInngestRunDispatcher } from "./inngest/run-dispatcher.js";
import { createPostgresRunRepository } from "./repositories/postgres-run-repository.js";
import { HttpRunnerClient } from "./runner-client.js";

export const serviceName = "@kordo/control-plane";

export async function start(): Promise<void> {
  const config = readConfig();
  const repository = createPostgresRunRepository(config.databaseUrl);
  const runnerClient = new HttpRunnerClient(config.runnerBaseUrl);
  const artifactStore = createLocalArtifactStore(config.artifactDir);
  const inngest = createKordoInngestClient(config.inngest);
  const inngestFunctions = createKordoInngestFunctions({
    artifactCleanupBatchSize: config.artifactCleanupBatchSize,
    artifactLimits: config.artifactLimits,
    artifactRetentionDays: config.artifactRetentionDays,
    artifactStore,
    inngest,
    repository,
    runnerClient,
  });
  const app = buildApp({
    artifactLimits: config.artifactLimits,
    artifactStore,
    ...(config.runDispatcherKind === "inngest"
      ? { dispatcher: createInngestRunDispatcher({ eventSender: inngest }) }
      : {}),
    inngest: {
      client: inngest,
      functions: inngestFunctions,
      ...(config.inngest.serveOrigin ? { serveOrigin: config.inngest.serveOrigin } : {}),
      servePath: config.inngest.servePath,
    },
    logger: true,
    repository,
    runPolicy: config.runPolicy,
    ...(config.runDispatcherKind === "in-process" ? { runnerClient } : {}),
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
