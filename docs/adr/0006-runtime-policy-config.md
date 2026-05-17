# ADR 0006: Configure Effective Run Policy at Runtime

## Status

Accepted

## Context

`@kordo/policy` centralizes how run requests are evaluated, but each deployment
needs to own what it allows. Local development should allow only
`docker-local-default`, while later environments may allow different sandbox
profiles or gateway routes.

## Decision

The control plane owns effective policy allowlists through runtime config:

```text
KORDO_ALLOWED_SANDBOX_PROFILES=docker-local-default
KORDO_ALLOWED_GATEWAY_ROUTES=
```

`@kordo/policy` evaluates the configured policy, but does not decide deployment
defaults for the control plane.

## Consequences

- Sandbox profile and gateway route allowlists can differ by environment without
  code changes.
- Inngest can reuse the same configured policy when orchestration moves out of
  the in-process dispatcher.
- The app requires an explicit `RunPolicy`, avoiding hidden service defaults.

## Deferred

- Authenticated policy administration.
- Gateway route policy design.
- Environment-specific production defaults.
