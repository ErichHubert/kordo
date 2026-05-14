export const DEFAULT_DATABASE_URL = "postgres://kordo:kordo@localhost:5432/kordo";

export interface ControlPlaneConfig {
  databaseUrl: string;
  host: string;
  port: number;
  runnerBaseUrl: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ControlPlaneConfig {
  return {
    databaseUrl: env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    host: env.CONTROL_PLANE_HOST ?? "0.0.0.0",
    port: readPort(env.CONTROL_PLANE_PORT ?? "4100"),
    runnerBaseUrl: env.RUNNER_BASE_URL ?? "http://127.0.0.1:4200",
  };
}

function readPort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid CONTROL_PLANE_PORT: ${value}`);
  }

  return port;
}
