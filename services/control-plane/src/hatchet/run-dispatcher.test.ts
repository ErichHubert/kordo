import { describe, expect, it } from "vitest";

import { RunnerJobSchema, type RunnerJob } from "@kordo/contracts";

import { KORDO_RUN_CREATED_EVENT_KEY, type KordoRunCreatedEventData } from "./events.js";
import { createHatchetRunDispatcher, type HatchetEventPublisher } from "./run-dispatcher.js";

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

describe("HatchetRunDispatcher", () => {
  it("pushes a run-created event for the runner job", async () => {
    const publisher = createCapturingEventPublisher();
    const dispatcher = createHatchetRunDispatcher({
      eventPublisher: publisher,
    });

    await dispatcher.dispatch(runnerJob);

    expect(publisher.events).toEqual([
      {
        eventKey: KORDO_RUN_CREATED_EVENT_KEY,
        options: {
          additionalMetadata: {
            runId: runnerJob.runId,
            runnerJobId: runnerJob.id,
            workflowId: runnerJob.workflowId,
          },
        },
        payload: {
          job: runnerJob,
        },
      },
    ]);
  });
});

interface CapturedEvent {
  eventKey: string;
  options?: { additionalMetadata?: Record<string, string> };
  payload: KordoRunCreatedEventData;
}

interface CapturingEventPublisher extends HatchetEventPublisher {
  events: CapturedEvent[];
}

function createCapturingEventPublisher(): CapturingEventPublisher {
  const events: CapturedEvent[] = [];

  return {
    events,
    async push(eventKey, payload, options) {
      events.push({
        eventKey,
        ...(options ? { options } : {}),
        payload,
      });
    },
  };
}
