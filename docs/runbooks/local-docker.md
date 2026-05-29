# Local Docker stack

`docker compose up` brings the gateway + auth MS + upload MS + redis online with `transport=redis`. The client (Vite + your chosen template) runs outside compose for hot-reload.

## Steps

1. `cp .env.docker.example .env.docker`
2. Fill the provider credentials (Supabase URL/keys, Firebase admin, Cloudinary, etc.).
3. `docker compose up --build`
4. In another terminal: `yarn nx vite:dev client-shadcn` (or `client-antd` / `client-mui`).
5. Verify the gateway: `curl http://localhost:3001/api/docs` — Swagger UI loads.

## Layout

```
docker-compose.yml          ← orchestrates the 4 services
Dockerfile.gateway          ← apps/api build → Node 24 alpine runtime
Dockerfile.ms-auth          ← apps/microservices/auth
Dockerfile.ms-upload        ← apps/microservices/upload
.env.docker.example         ← documented env template
.dockerignore               ← excludes node_modules, dist, .nx, .yarn cache, etc.
```

Only the gateway publishes a port (`3001:3001`); the MSes are reachable inside the `icore` docker network via the redis broker.

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

`.github/workflows/pipeline.yml` builds all three Dockerfiles on every push to `dev` and `main` via a matrix job. The job uses GitHub Actions cache for buildx layers so subsequent CI runs reuse intermediate stages.

## What is NOT in compose

- **Postgres / Firestore / storage providers** — point at your cloud project via `.env.docker`. The local stack is provider-agnostic.
- **Payment MS / Notes MS** — opt-in via the CLI. Add their service entries to the compose file if you ship them in your project.
- **SPA** — runs outside compose for hot-reload. Add a `client` service if you want a production-style deployment.
