# Maintenance Standard

Kordo uses small maintenance checkpoints between functional milestones. The goal
is to keep the codebase easy to change without pausing feature work for a large
cleanup phase.

## Local Verification

Run the same verification command that CI runs:

```sh
corepack pnpm verify
```

The verification command runs:

- `corepack pnpm build`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm format:check`

## Code Hygiene

- Keep public contracts in `@kordo/contracts`.
- Keep control-plane state behavior inside control-plane repositories.
- Keep runner execution behavior behind the sandbox backend boundary.
- Prefer small modules when parsing, persistence, or execution logic starts to
  obscure route handlers.
- Add comments only for non-obvious intent, operational boundaries, or failure
  semantics. Prefer clear names and focused tests for ordinary behavior.

## CI

The GitHub Actions workflow in `.github/workflows/ci.yml` installs dependencies
with the lockfile and runs `corepack pnpm verify`.
