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

In Milestone 5, the control plane calls the runner synchronously. The runner
starts a disposable Docker container, executes `node --version`, captures stdout,
stderr, exit code, duration, and cleanup status, then returns the result.

The run should move from `queued` to `running` to `completed`. Use the returned
`runnerJobId` to inspect sandbox output:

```sh
curl -sS http://127.0.0.1:4200/jobs/<runnerJobId>
```
