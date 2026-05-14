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
