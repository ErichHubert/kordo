export interface RunnerConfig {
  host: string;
  port: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  return {
    host: env.RUNNER_HOST ?? "0.0.0.0",
    port: readPort(env.RUNNER_PORT ?? "4200"),
  };
}

function readPort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid RUNNER_PORT: ${value}`);
  }

  return port;
}
