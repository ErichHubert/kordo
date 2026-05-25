# ADR 0007: Dispatch Runs Through Hatchet

## Status

Accepted

## Context

The walking skeleton used an in-process dispatcher and then an Inngest-backed
dispatcher to prove the run lifecycle. Inngest fit the durable orchestration
model, but its server and CLI license did not match Kordo's preference for a
permissively licensed orchestration layer.

## Decision

Use Hatchet as the run dispatcher.

`POST /runs` still validates, persists a queued run, creates a runner job, and
returns HTTP `202`. Instead of executing the job in the API process, it pushes a
`kordo.run.created` event to Hatchet. A separate orchestrator worker process
marks the run running, calls the sandbox runner, materializes artifacts, and
finalizes the run.

The control plane API does not expose a workflow callback endpoint. The
orchestrator worker connects to the Hatchet engine and registers Kordo workflows
from the control-plane package.

```text
corepack pnpm --filter @kordo/control-plane dev:orchestrator
```

The artifact cleanup job is registered as a scheduled Hatchet workflow.

## Consequences

- The public run API remains stable.
- Run execution is now event-backed.
- Local development needs the Hatchet engine and a Kordo orchestrator worker.
- Hatchet provides the outer workflow engine for the later PI multi-role flow.
- The API process, orchestrator worker, and sandbox runner now have clearer
  deployment boundaries.

## Deferred

- Production Hatchet deployment and token management.
- Workflow retry policy tuning.
- Explicit cancellation flow.
- Durable recovery testing against a restarted control-plane process.
- Replacing local artifact storage with object storage.
