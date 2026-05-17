# ADR 0004: Add Local Artifact Retention and Limits

## Status

Accepted

## Context

The local artifact store makes run output durable, but durable files can grow
without bound if Kordo is left running over time. The first implementation needs
clear limits before artifacts become larger than stdout and stderr logs.

## Decision

Kordo enforces conservative artifact defaults in the control plane:

```text
KORDO_ARTIFACT_RETENTION_DAYS=7
KORDO_MAX_ARTIFACT_BYTES=10485760
KORDO_MAX_RUN_ARTIFACT_BYTES=52428800
```

Stdout and stderr are log artifacts. They are truncated at the per-artifact
limit, and their artifact refs are marked with `truncated` and
`originalSizeBytes`. The run can still complete when only log truncation occurs.

If the materialized artifacts for a run exceed the per-run limit, the control
plane fails the run with `ArtifactLimitExceeded` before persisting the final run
result.

Expired local artifact files are removed by an explicit cleanup command:

```sh
corepack pnpm --filter @kordo/control-plane artifacts:cleanup
```

The cleanup command uses persisted run metadata, only considers terminal runs,
and does not delete queued or running run artifacts.

## Consequences

- Local disk growth is bounded by explicit limits and operator-driven cleanup.
- Run metadata, lifecycle events, and artifact refs remain in PostgreSQL after
  local artifact files are deleted.
- Reading an artifact whose file has been removed returns
  `ArtifactContentNotFound`.
- Cleanup can run manually or through the scheduled Inngest cleanup function.

## Deferred

- Object-storage lifecycle policies.
- Per-artifact-type limits.
- Streaming large artifacts directly to storage.
- Persisted artifact expiration/deletion metadata.
