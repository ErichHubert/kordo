# ADR 0007: Dispatch Runs Through Inngest

## Status

Accepted

## Context

The walking skeleton used an in-process dispatcher to prove the run lifecycle
without requiring orchestration. That proved the contract, but it kept queued
work inside the control-plane process and gave no external workflow visibility or
retry boundary.

## Decision

Use Inngest as the run dispatcher.

`POST /runs` still validates, persists a queued run, creates a runner job, and
returns HTTP `202`. Instead of executing the job in-process, it sends a
`kordo/run.created` event to Inngest. The Inngest function then marks the run
running, calls the runner, materializes artifacts, and finalizes the run.

The control plane exposes Inngest functions at:

```text
/api/inngest
```

The artifact cleanup job is also registered as a scheduled Inngest function.

## Consequences

- The public run API remains stable.
- Run execution is now event-backed.
- Local development needs the Inngest dev server.
- Inngest retries apply to failed function execution before the failure handler
  marks the run failed.

## Deferred

- Production Inngest signing/event key setup.
- Explicit cancellation flow.
- Durable recovery testing against a restarted control-plane process.
- Replacing local artifact storage with object storage.
