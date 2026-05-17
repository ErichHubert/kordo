import { describe, expect, it } from "vitest";

import { RunnerJobSchema, type RunnerJob } from "@kordo/contracts";

import { KORDO_RUN_CREATED_EVENT_NAME } from "./events.js";
import { createInngestRunDispatcher, type InngestEventSender } from "./run-dispatcher.js";

const runnerJob: RunnerJob = RunnerJobSchema.parse({
  id: "job_123",
  runId: "run_123",
  workflowId: "artifexarena.issue.fix",
  sandbox: {
    backend: "docker-local",
    profile: "docker-local-default",
    image: "node:24-alpine",
  },
  command: {
    argv: ["node", "--version"],
    timeoutMs: 30_000,
  },
  environmentPolicy: {
    allowNetwork: false,
    allowedEnv: [],
  },
  allowedGatewayRoutes: [],
  createdAt: "2026-05-14T20:00:00.000Z",
});

describe("InngestRunDispatcher", () => {
  it("sends a run-created event for the runner job", async () => {
    const sender = createCapturingEventSender();
    const dispatcher = createInngestRunDispatcher({
      eventSender: sender,
    });

    await dispatcher.dispatch(runnerJob);

    expect(sender.events).toEqual([
      {
        data: {
          job: runnerJob,
        },
        id: runnerJob.id,
        name: KORDO_RUN_CREATED_EVENT_NAME,
      },
    ]);
  });
});

interface CapturingEventSender extends InngestEventSender {
  events: unknown[];
}

function createCapturingEventSender(): CapturingEventSender {
  const events: unknown[] = [];

  return {
    events,
    async send(payload) {
      events.push(payload);
    },
  };
}
