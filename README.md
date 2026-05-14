# Kordo

Kordo is the reusable workflow execution platform for agent-driven runs. This
repository starts with the smallest walking skeleton: shared contracts, a
control-plane service, a runner service, and local infrastructure.

## Milestone 1

This milestone establishes the TypeScript monorepo structure and baseline
tooling. It does not implement the run lifecycle yet.

## Walking Skeleton

The current walking skeleton accepts a manual run through the control plane,
persists queued/running/completed lifecycle events in PostgreSQL, dispatches a
runner job asynchronously, executes `node --version` in a disposable Docker-local
sandbox, and persists the final execution result for inspection through the
control-plane API.

## Commands

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm format:check
corepack pnpm verify
```

## CI

Pull requests and pushes to `main` run the same verification command in GitHub
Actions:

```sh
corepack pnpm verify
```

See [docs/maintenance.md](/Users/erich/Dev/github/public/kordo/docs/maintenance.md) for the maintenance
standard used between functional milestones.
