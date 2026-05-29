# Plan 11 — docker-compose Local Dev Stack

**Date:** 2026-05-29
**Status:** Approved design — implementation lives in `docs/superpowers/plans/2026-05-29-plan-11-docker-compose.md`.

## Goal

Ship a one-command local dev loop: `docker compose up` brings the gateway, auth MS, upload MS, and a Redis broker online with the chosen transport set to `redis` so the services talk over a real broker (closer to production than the default TCP). Provider credentials for Supabase / Firebase / Cloudinary stay env-driven; the compose file expects a `.env.docker` next to it.

## Scope decisions

- **Services in compose:** gateway + auth MS + upload MS + redis. (Payment + notes MS land in their own plans; compose file gains stubs commented out.)
- **No local Postgres / Supabase emulator / Firebase emulator.** Provider creds point at the user's cloud project. Reasons:
  - Local emulator stacks add 6+ containers and brittle health-check chains.
  - Production parity matters more than offline development for this scaffold; if a consumer wants offline they wire it themselves.
  - The compose file stays under ~80 lines.
- **No traefik / nginx ingress.** Gateway publishes `3001` directly; the SPA dev server runs outside compose (`yarn nx vite:dev client-shadcn`).

## Files

```
Dockerfile.gateway                 ← apps/api multi-stage build
Dockerfile.ms-auth                 ← apps/microservices/auth
Dockerfile.ms-upload               ← apps/microservices/upload
docker-compose.yml                 ← orchestrates redis + 3 services
.env.docker.example                ← documented env template
.dockerignore                      ← node_modules, dist, .nx, .yarn cache excluded
```

Dockerfiles live at the repo root (not per-app) because Nx workspaces need the lockfile + tsconfigs from the root to build any single project.

## Dockerfile pattern (gateway example)

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
WORKDIR /workspace
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN corepack enable && yarn install --immutable
COPY . .
RUN yarn nx build api

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=builder /workspace/dist/apps/api ./dist
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/package.json ./
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

Same shape for the two MS images, swapping the build target + entrypoint. Optimised builds (multi-stage + `corepack` instead of `npm i -g yarn`) keep the runtime image small.

## docker-compose.yml shape

```yaml
services:
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      retries: 10
    networks: [icore]

  auth:
    build: { context: ., dockerfile: Dockerfile.ms-auth }
    env_file: .env.docker
    environment:
      AUTH_TRANSPORT: redis
      AUTH_REDIS_URL: redis://redis:6379
    depends_on:
      redis: { condition: service_healthy }
    networks: [icore]

  upload:
    build: { context: ., dockerfile: Dockerfile.ms-upload }
    env_file: .env.docker
    environment:
      UPLOAD_TRANSPORT: redis
      UPLOAD_REDIS_URL: redis://redis:6379
    depends_on:
      redis: { condition: service_healthy }
    networks: [icore]

  gateway:
    build: { context: ., dockerfile: Dockerfile.gateway }
    env_file: .env.docker
    environment:
      AUTH_TRANSPORT: redis
      AUTH_REDIS_URL: redis://redis:6379
      UPLOAD_TRANSPORT: redis
      UPLOAD_REDIS_URL: redis://redis:6379
    ports: ['3001:3001']
    depends_on:
      redis: { condition: service_healthy }
      auth: { condition: service_started }
      upload: { condition: service_started }
    networks: [icore]

networks:
  icore: { driver: bridge }
```

Reasonable defaults; the `env_file` carries provider creds + `CLIENT_ORIGIN` + `ADMINS_LIST`.

## `.env.docker.example`

Mirrors the existing per-MS `.env.example` files, namespaced for the compose context:

```
# Auth
AUTH_PROVIDER=supabase
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMINS_LIST=owner@example.com

# Upload
STORAGE_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET=uploads

# Gateway-only
CLIENT_ORIGIN=http://localhost:4200
```

## Docs

`docs/runbooks/local-docker.md` walks through:

1. Copy `.env.docker.example` → `.env.docker`, fill credentials.
2. `docker compose up --build`.
3. Run client outside compose (`yarn nx vite:dev client-shadcn`).
4. Health-check the gateway (`curl localhost:3001/api/docs`).

## Out of scope

- **CI integration** — running the compose stack in GitHub Actions is a future runbook, not part of this plan.
- **Production Helm / k8s charts** — out of band; consumers ship their own.
- **TLS / reverse proxy** — local dev uses HTTP only.
- **Database / storage emulators** — see scope decision above.
- **Auto-updating client image** — client runs locally via Vite for speed; building a Vite image makes sense only for prod deployment.
- **Hot-reload inside containers** — Nest's `--watch` mode would need volume mounts that bypass the optimised image; not worth the complexity for a scaffold.

## Tests

- CI job in `pipeline.yml` builds the three Dockerfiles to catch breakage (no compose-up in CI, just build).
- Smoke runbook gets exercised manually before each release.
