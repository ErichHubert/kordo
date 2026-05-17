import { Inngest } from "inngest";

export interface KordoInngestClientConfig {
  appId: string;
  baseUrl?: string;
  eventKey?: string;
  dev: boolean;
  signingKey?: string;
}

export function createKordoInngestClient(config: KordoInngestClientConfig): Inngest {
  return new Inngest({
    id: config.appId,
    isDev: config.dev,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.eventKey ? { eventKey: config.eventKey } : {}),
    ...(config.signingKey ? { signingKey: config.signingKey } : {}),
  });
}
