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

Start the runner:

```sh
corepack pnpm --filter @kordo/runner dev
```

Start the control plane in a second terminal:

```sh
corepack pnpm --filter @kordo/control-plane dev
```

The default local service URLs are:

```text
control plane: http://127.0.0.1:4100
runner:        http://127.0.0.1:4200
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

In the current walking skeleton, `POST /runs` accepts a run and returns the
queued run immediately with HTTP `202`. An in-process dispatcher then starts a
runner job in the background. The runner starts a disposable Docker container,
executes `node --version`, captures stdout, stderr, exit code, duration, cleanup
status, and an artifact manifest, then returns the result to the dispatcher. The
control plane stores stdout and stderr as local artifacts before it marks the run
complete.

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

The runner still exposes its in-memory job view while the process is running.
After a run moves to `running`, use its `runnerJobId` if you want to compare the
control-plane result with the raw runner response:

```sh
curl -sS http://127.0.0.1:4200/jobs/<runnerJobId>
```
