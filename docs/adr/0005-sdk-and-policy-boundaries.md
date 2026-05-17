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
- `@kordo/policy` owns shared allowlist evaluation for run requests.

The control plane validates request shape through `@kordo/contracts` first, then
validates run admission through `@kordo/policy`. The effective allowlists are
owned by control-plane runtime config.

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
- Gateway route policy.
- Inngest-backed dispatch.
