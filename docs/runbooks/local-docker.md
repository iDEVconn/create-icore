# Local Docker stack

`docker compose up` brings postgres + redis + auth MS + upload MS + jobs MS + payment MS + ai-orchestrator MS + the gateway online with the transport you picked at scaffold time (the template itself ships `redis`). The client (Vite + your chosen template) runs outside compose for hot-reload — or use `Dockerfile.client` for a production-style container (see below).

## Steps

1. `cp .env.docker.example .env.docker`
2. Fill the provider credentials (Supabase URL/keys, Firebase admin, Cloudinary, etc.).
3. `docker compose up --build`
4. In another terminal: `yarn nx vite:dev client-shadcn` (or `client-antd` / `client-mui`).
5. Verify the gateway: `curl http://localhost:3001/api/docs` — Swagger UI loads (only outside production; see `should-enable-swagger.ts`).

## Transport vs. Redis

Redis is in the stack whenever sessions live in it (`--session=redis`, the default): the gateway's BFF session store (`SESSION_REDIS_URL`, see `bff-session-auth-migration.md`) refuses to boot without it. With `--session=memory` the generator removes the Redis service, volume and every `depends_on: redis` and gives the gateway `SESSION_STORE: memory` + `SESSION_STORE_ALLOW_MEMORY: 'true'` — unless `--jobs=bullmq` or `--transport=redis` still need Redis, in which case it stays. The transport decides how gateway ↔ MS talk:

| `--transport`               | auth / upload MS env in compose                                                                      | MS `depends_on: redis` |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| `redis`                     | `*_TRANSPORT: redis` + `*_REDIS_URL`                                                                 | yes                    |
| `tcp`                       | `*_TRANSPORT: tcp`, `*_HOST: 0.0.0.0`, `*_PORT: 4001/4002` (gateway side: `*_HOST: auth` / `upload`) | no                     |
| `nats`/`mqtt`/`rmq`/`kafka` | `*_TRANSPORT: <kind>`, broker URL comes from `.env.docker`                                           | no                     |

No broker service ships in compose — for nats/mqtt/rmq/kafka add one yourself. `create-icore` rewrites compose via `rewriteComposeTransport` (`tools/create-icore/src/lib/scaffold-env.ts`); before this it left `*_TRANSPORT: redis` hardcoded regardless of `--transport`.

## Layout

```
docker-compose.yml          ← orchestrates postgres, redis, auth, upload, jobs, payment, ai, gateway
Dockerfile.gateway          ← apps/api build → Node 24 alpine runtime
Dockerfile.ms-auth          ← apps/microservices/auth
Dockerfile.ms-upload        ← apps/microservices/upload
Dockerfile.ms-jobs          ← apps/microservices/jobs
Dockerfile.ms-payment       ← apps/microservices/payment (not yet copied into scaffolded projects — tracked gap)
Dockerfile.ms-ai            ← apps/microservices/ai-orchestrator
Dockerfile.client           ← apps/client production build → nginx:1.27-alpine static runtime (PR #282)
nginx.client.conf           ← SPA fallback config for Dockerfile.client
.env.docker.example         ← documented env template
.dockerignore               ← excludes node_modules, dist, .nx, .yarn cache, etc.
```

Only the gateway publishes a port to all interfaces (`3001:3001`); postgres binds `127.0.0.1:5432:5432` (host-only, not reachable from outside the host) for local `psql` access. Redis has no published port. Postgres and redis data persist in named volumes (`icore_postgres_data`, `icore_redis_data`) — `docker compose down` no longer silently discards data; use `docker compose down -v` to actually wipe it.

## Troubleshooting

- **`auth` service exits immediately** — usually a missing env var. `docker compose logs auth` to see the stack.
- **Gateway can't reach redis** — verify the compose env injected `AUTH_TRANSPORT=redis` and `AUTH_REDIS_URL=redis://redis:6379`. The file already sets these explicitly.
- **Slow first build** — `yarn install --immutable` runs once per image; subsequent builds hit the layer cache.
- **`Hot-reload` not working** — by design. Run the SPA outside compose to keep Vite HMR snappy. The MS images are optimised builds, not dev mode.

## Targeted rebuilds

```bash
# Rebuild only the gateway image
docker compose up --build gateway

# Tail logs from a single service
docker compose logs -f auth
```

## CI

`.github/workflows/pipeline.yml` builds the Dockerfiles on every push to `dev` and `main` via a matrix job. The job uses GitHub Actions cache for buildx layers so subsequent CI runs reuse intermediate stages.

## What is NOT in compose

- **Firestore / non-Postgres storage providers** — point at your cloud project via `.env.docker`. Only the built-in `POSTGRES_PROVIDER` stack (postgres + redis) ships in-compose; other providers are provider-agnostic by design.
- **Notes MS** — demo-only, opt-in via the CLI, deleted before production per `AGENTS.md`.
- **SPA runtime container** — the SPA runs outside compose for hot-reload by default. `Dockerfile.client` exists for a production-style build; add a `client` service entry to `docker-compose.yml` yourself if you want it orchestrated alongside the rest of the stack.
