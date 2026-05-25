# Kordo

Kordo is the reusable workflow execution platform for agent-driven runs. This
repository starts with the smallest walking skeleton: shared contracts, a
control-plane service, a sandbox runner service, and local infrastructure.

## Milestone 1

This milestone establishes the TypeScript monorepo structure and baseline
tooling. It does not implement the run lifecycle yet.

## Walking Skeleton

The current walking skeleton accepts a manual run through the control plane,
persists queued/running/completed lifecycle events in PostgreSQL, pushes a
Hatchet `kordo.run.created` event, coordinates execution through an orchestrator
worker, executes `node --version` in a disposable Docker-local sandbox through
the sandbox runner, and persists the final execution result for inspection
through the control-plane API. The control plane stores stdout and stderr as
local artifacts and exposes them through run-scoped artifact URLs.
Local log artifacts are limited, can be truncated, and can be cleaned up after a
retention period.

## Commands

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
corepack pnpm verify
corepack pnpm smoke:local
corepack pnpm dev:stack
corepack pnpm smoke:stack
corepack pnpm dev:stack:down
```

`dev:stack` starts the full local platform through Docker Compose: PostgreSQL,
Hatchet, migrations, the sandbox runner, the control-plane API, and the
orchestrator worker. `smoke:stack` runs the walking-skeleton smoke test against
that stack.

## Package Boundaries

- `@kordo/contracts` is the source of truth for runtime schemas and shared
  TypeScript types.
- `@kordo/sdk` is the typed client for the control-plane API.
- `@kordo/policy` evaluates run admission rules for sandbox profiles and gateway
  routes.

## Runtime Policy

The control-plane config owns what this environment allows:

```text
KORDO_ALLOWED_SANDBOX_PROFILES=docker-local-default
KORDO_ALLOWED_GATEWAY_ROUTES=
```

`@kordo/policy` owns how those allowlists are evaluated.

## Run Dispatch

Run dispatch is Hatchet-backed:

```text
HATCHET_CLIENT_TOKEN=<local-hatchet-api-token>
HATCHET_CLIENT_HOST_PORT=127.0.0.1:7077
HATCHET_CLIENT_TLS_STRATEGY=none
KORDO_HATCHET_CLIENT_NAMESPACE=kordo
KORDO_ORCHESTRATOR_WORKER_NAME=kordo-orchestrator-worker
KORDO_ORCHESTRATOR_WORKER_SLOTS=10
```

## Artifact Storage

The local control plane stores artifact content under `.kordo/artifacts` by
default and stores artifact metadata in PostgreSQL. The default artifact policy
is:

```text
KORDO_ARTIFACT_RETENTION_DAYS=7
KORDO_MAX_ARTIFACT_BYTES=10485760
KORDO_MAX_RUN_ARTIFACT_BYTES=52428800
```

Run this command to remove expired local artifact files for terminal runs:

```sh
corepack pnpm --filter @kordo/control-plane artifacts:cleanup
```

## CI

Pull requests and pushes to `main` run the same verification command in GitHub
Actions:

```sh
corepack pnpm verify
```

See [docs/maintenance.md](/Users/erich/Dev/github/public/kordo/docs/maintenance.md) for the maintenance
standard used between functional milestones.
