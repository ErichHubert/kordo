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

Start the runner stub:

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
      "title": "Verify runner stub"
    },
    "sandboxProfile": "docker-local-default",
    "allowedGatewayRoutes": []
  }'
```

In Milestone 4, the control plane calls the runner stub synchronously. The run
should move from `queued` to `running` to `completed` without starting a Docker
sandbox yet.
