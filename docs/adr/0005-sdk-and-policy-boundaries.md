# ADR 0005: Add SDK and Policy Package Boundaries

## Status

Accepted

## Context

The walking skeleton now has stable control-plane APIs and basic run safety
rules. Inngest, the future UI, and later PI/gateway integrations will need to
call the same APIs and apply the same run admission decisions.

## Decision

Add two reusable packages:

- `@kordo/sdk` is a thin typed client for the control-plane API.
- `@kordo/policy` owns shared allowlist checks for run requests.

The control plane validates request shape through `@kordo/contracts` first, then
validates run admission through `@kordo/policy`. The first policy allows only the
`docker-local-default` sandbox profile and rejects all gateway routes until the
gateway security model exists.

## Consequences

- Future UI and orchestration code can reuse the SDK instead of duplicating
  fetch and response validation logic.
- Policy decisions are centralized before Inngest introduces another execution
  path.
- The policy package is intentionally simple allowlist logic, not a policy
  engine.

## Deferred

- Authentication and authorization.
- PI.dev workflow package.
- Runtime-configurable policy allowlists for sandbox profiles and gateway
  routes.
- Gateway route policy.
- Inngest-backed dispatch.
