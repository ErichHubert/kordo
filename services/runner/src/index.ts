import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { createInMemoryRunnerJobRepository } from "./jobs.js";

export const serviceName = "@kordo/runner";

export async function start(): Promise<void> {
  const config = readConfig();
  const app = buildApp({
    logger: true,
    repository: createInMemoryRunnerJobRepository(),
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
