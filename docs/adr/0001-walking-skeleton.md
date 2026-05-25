# ADR 0001: Start With A Walking Skeleton

## Status

Accepted

## Context

Kordo will eventually coordinate agent workflows, isolated execution, artifacts,
gateway permissions, and external harnesses. Building every component up front
would make the first implementation hard to reason about and difficult to
review.

## Decision

Start with a small TypeScript monorepo and prove the platform path in stages:
contracts, control plane, runner, Docker-local sandbox, then end-to-end run
lifecycle.

## Consequences

- Early milestones favor clarity and reviewability over final isolation strength.
- Docker-local is a development backend, not the final security boundary.
- MicroVMs, Veyra, PI.dev, and GitHub triggers are deferred until the
  run lifecycle is proven.
