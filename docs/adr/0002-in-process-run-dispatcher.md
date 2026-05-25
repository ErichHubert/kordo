# ADR 0002: Start Async Dispatch In Process

## Status

Superseded by [ADR 0007](./0007-inngest-run-dispatch.md). The production
in-process dispatcher was removed in Milestone 11.1.

## Context

Milestone 9 changed `POST /runs` from synchronous execution to asynchronous
dispatch. The control plane now accepts a run, stores it as `queued`, and returns
HTTP `202` before runner execution completes.

Kordo will likely use Inngest or another event-backed orchestrator later, but
the current walking skeleton still needs a small implementation that proves the
control-plane API shape, state transitions, failure semantics, and runner
contract without introducing another distributed dependency.

## Decision

Use an in-process run dispatcher for the current walking skeleton.

The dispatcher:

- rejects new dispatches after it is closed,
- tracks in-flight dispatch work,
- waits for in-flight dispatch work during application shutdown,
- marks the run `running` before calling the runner,
- stores the runner result and final run state when the runner returns,
- marks the run `failed` with `RunnerDispatchFailed` when runner dispatch fails,
- logs background failures with `runId`, `runnerJobId`, and `workflowId`.

The control-plane API remains event-backed in shape, but not yet backed by an
external event bus:

```text
POST /runs
  -> create queued run
  -> schedule dispatcher work
  -> return HTTP 202

in-process dispatcher
  -> mark run running
  -> call runner
  -> persist completed or failed result
```

## Consequences

- The API no longer blocks while runner execution completes.
- Local development and tests stay simple.
- Shutdown waits for in-flight dispatches instead of abandoning them
  intentionally.
- If the process crashes, in-flight work is not recovered automatically.
- Inngest is still deferred until the run lifecycle and failure semantics are
  stable enough to move behind an orchestrator boundary.

## Future Migration

When Inngest is introduced, it should replace or implement the dispatcher
boundary instead of changing the public control-plane routes. The expected shape
is:

```text
POST /runs
  -> create queued run
  -> emit run.created
  -> return HTTP 202

Inngest function
  -> receive run.created
  -> dispatch runner job
  -> persist completed or failed result
```

The control-plane read APIs should remain stable:

- `GET /runs`
- `GET /runs/:id`
- `GET /runs/:id/events`
- `GET /runs/:id/result`
