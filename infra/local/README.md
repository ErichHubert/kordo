# Local Infrastructure

This directory holds Docker Compose configuration for local development.

## PostgreSQL

Start the local database:

```sh
docker compose -f infra/local/compose.yaml up -d postgres
```

The default control-plane database URL is:

```text
postgres://kordo:kordo@localhost:5432/kordo
```

Run the control-plane migrations:

```sh
corepack pnpm --filter @kordo/control-plane db:migrate
```

Start the sandbox runner:

```sh
corepack pnpm --filter @kordo/runner dev
```

Start the control plane in a second terminal:

```sh
corepack pnpm --filter @kordo/control-plane dev
```

Start the Hatchet engine in a third terminal:

```sh
curl -fsSL https://install.hatchet.run/install.sh | bash
hatchet server start
```

Open the Hatchet dashboard, create a local API token, and export it for both the
control-plane API and orchestrator worker processes:

```sh
export HATCHET_CLIENT_TOKEN="<local-hatchet-api-token>"
export HATCHET_CLIENT_HOST_PORT="127.0.0.1:7077"
export HATCHET_CLIENT_TLS_STRATEGY="none"
export KORDO_HATCHET_CLIENT_NAMESPACE="kordo"
```

Start the orchestrator worker in a fourth terminal:

```sh
corepack pnpm --filter @kordo/control-plane dev:orchestrator
```

The default local service URLs are:

```text
control plane: http://127.0.0.1:4100
sandbox runner: http://127.0.0.1:4200
hatchet:       http://127.0.0.1:8888
```

Create a manual run:

```sh
curl -sS -X POST http://127.0.0.1:4100/runs \
  -H 'content-type: application/json' \
  --data '{
    "workflowId": "artifexarena.issue.fix",
    "input": {
      "source": "manual",
      "title": "Verify Docker sandbox"
    },
    "sandboxProfile": "docker-local-default",
    "allowedGatewayRoutes": []
  }'
```

Or run the local smoke test:

```sh
corepack pnpm smoke:local
```

In the current walking skeleton, `POST /runs` accepts a run and returns the
queued run immediately with HTTP `202`. The control plane pushes a Hatchet
`kordo.run.created` event. The orchestrator worker marks the run `running`, calls
the sandbox runner, stores stdout and stderr as local artifacts, and marks the run
complete. The sandbox runner starts a disposable Docker container, executes
`node --version`, captures stdout, stderr, exit code, duration, cleanup status,
and an artifact manifest, then returns the result to the control plane.

The run should move from `queued` to `running` to `completed`. Use the returned
run `id` to poll the run state:

```sh
curl -sS http://127.0.0.1:4100/runs/<runId>
```

List recent runs from the control plane:

```sh
curl -sS http://127.0.0.1:4100/runs
```

The list endpoint returns the 50 newest runs by default. It also accepts
`status` and `limit` query parameters:

```sh
curl -sS 'http://127.0.0.1:4100/runs?status=completed&limit=10'
```

Use the returned run `id` to inspect the lifecycle events:

```sh
curl -sS http://127.0.0.1:4100/runs/<runId>/events
```

Use the returned run `id` to inspect the persisted execution result from the
control plane:

```sh
curl -sS http://127.0.0.1:4100/runs/<runId>/result
```

The result includes the sandbox container name, command, stdout, stderr, exit
code, duration, timeout flag, cleanup result, and artifact manifest.

The artifact manifest includes `stdout.log` and `stderr.log` refs. Read an
artifact through the control plane:

```sh
curl -sS http://127.0.0.1:4100/runs/<runId>/artifacts/<artifactId>
```

By default local artifact content is stored under `.kordo/artifacts` relative to
the control-plane process working directory. With the `pnpm --filter`
development command above, that resolves to:

```text
services/control-plane/.kordo/artifacts
```

Override that location with:

```sh
KORDO_ARTIFACT_DIR=/tmp/kordo-artifacts corepack pnpm --filter @kordo/control-plane dev
```

The default local artifact policy keeps files for 7 days, truncates individual
log artifacts after 10 MB, and fails a run if materialized artifacts exceed 50
MB total:

```text
KORDO_ARTIFACT_RETENTION_DAYS=7
KORDO_MAX_ARTIFACT_BYTES=10485760
KORDO_MAX_RUN_ARTIFACT_BYTES=52428800
```

The default local run policy allows only the Docker-local sandbox profile and no
gateway routes:

```text
KORDO_ALLOWED_SANDBOX_PROFILES=docker-local-default
KORDO_ALLOWED_GATEWAY_ROUTES=
```

Clean up expired local artifact files for terminal runs with:

```sh
corepack pnpm --filter @kordo/control-plane artifacts:cleanup
```

## Failure behavior

If the runner accepts a job and the sandbox command fails, times out, or the
sandbox backend fails to start, the runner returns a failed job result. The
control plane persists that result, marks the run `failed`, and exposes the
failure through:

```sh
curl -sS http://127.0.0.1:4100/runs/<runId>
curl -sS http://127.0.0.1:4100/runs/<runId>/events
curl -sS http://127.0.0.1:4100/runs/<runId>/result
```

If the control plane cannot reach the runner at all, it marks the run `failed`
with `RunnerDispatchFailed` after the initial `POST /runs` response has already
returned. In that case there is no runner result to persist, so
`/runs/<runId>/result` returns `RunResultNotFound`.

If a run request uses an unsupported sandbox profile or asks for gateway routes,
the control plane rejects it before persistence with `RunPolicyRejected`.

The runner still exposes its in-memory job view while the process is running.
After a run moves to `running`, use its `runnerJobId` if you want to compare the
control-plane result with the raw runner response:

```sh
curl -sS http://127.0.0.1:4200/jobs/<runnerJobId>
```
