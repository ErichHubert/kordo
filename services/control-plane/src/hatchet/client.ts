import { HatchetClient } from "@hatchet-dev/typescript-sdk";

import type { HatchetClientConfig } from "../config.js";

export type KordoHatchetClient = HatchetClient;

export function createKordoHatchetClient(config: HatchetClientConfig): KordoHatchetClient {
  return HatchetClient.init({
    ...(config.apiUrl ? { api_url: config.apiUrl } : {}),
    ...(config.hostPort ? { host_port: config.hostPort } : {}),
    ...(config.logLevel ? { log_level: config.logLevel } : {}),
    ...(config.namespace ? { namespace: config.namespace } : {}),
    ...(config.tlsStrategy ? { tls_config: { tls_strategy: config.tlsStrategy } } : {}),
    ...(config.token ? { token: config.token } : {}),
  });
}
