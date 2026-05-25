# ADR 0003: Store Initial Artifacts Locally

## Status

Accepted

## Context

Kordo needs durable run outputs before introducing a production orchestrator or
UI. Until now, stdout and stderr lived only inside the runner execution JSON.
That was enough to prove the walking skeleton, but it is not enough for larger
outputs, downloadable logs, UI inspection, or future object storage.

## Decision

The control plane owns artifact persistence for now.

When a runner result returns, the Inngest run function stores stdout and stderr
through an `ArtifactStore` before finalizing the run. The resulting
`ArtifactRef`s are attached to the runner result manifest, persisted on the run,
and exposed through a run-scoped control-plane read endpoint:

```text
GET /runs/:id/artifacts/:artifactId
```

The local development implementation writes files under `.kordo/artifacts` by
default. The directory can be overridden with `KORDO_ARTIFACT_DIR`.

## Consequences

- Run state and run results now include durable stdout/stderr artifact refs.
- The control plane can serve artifact content without calling the runner.
- Local artifacts are ignored by git.
- Local filesystem storage is not a production storage backend.
- A later object-storage backend should implement the same `ArtifactStore`
  boundary.

## Deferred

- Authenticated artifact access.
- Object storage.
- Large artifact streaming.
- Redaction of sensitive output.
