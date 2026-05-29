# Plan 11: docker-compose Local Dev Stack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-command local dev loop: `docker compose up` brings the gateway, auth MS, upload MS, and a Redis broker online with `transport=redis`. Provider creds stay env-driven via `.env.docker`.

**Architecture:** see `docs/superpowers/specs/2026-05-29-plan-11-docker-compose-design.md`.

**Branch:** `dev`. Previous head (Plan 10): TBD on landing.

---

## Task 1: `.dockerignore` + Dockerfile.gateway

**Files:**

- Add: `.dockerignore`
- Add: `Dockerfile.gateway`

- [ ] **Step 1: .dockerignore**

```
node_modules
**/node_modules
dist
**/dist
.nx
.yarn/cache
.yarn/install-state.gz
.git
*.log
.env*
!.yarn/releases
!.yarn/plugins
```

- [ ] **Step 2: Dockerfile.gateway**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
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

- [ ] **Step 3: Verify build**

```bash
docker build -f Dockerfile.gateway -t icore-gateway:dev .
docker run --rm -e AUTH_PROVIDER=supabase -e SUPABASE_URL=... icore-gateway:dev --help || true
```

(Failure with missing env is expected; we're verifying the image boots.)

**Commit:** `feat(docker): Dockerfile.gateway (multi-stage Node 24 alpine) + .dockerignore`

---

## Task 2: Dockerfile.ms-auth + Dockerfile.ms-upload

**Files:**

- Add: `Dockerfile.ms-auth`
- Add: `Dockerfile.ms-upload`

Same pattern as gateway, swapping the build target + entrypoint:

```dockerfile
# Dockerfile.ms-auth
FROM node:24-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable
COPY . .
RUN yarn nx build auth

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
COPY --from=builder /workspace/dist/apps/microservices/auth ./dist
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/package.json ./
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
```

`Dockerfile.ms-upload` is identical with `upload` in place of `auth`.

```bash
docker build -f Dockerfile.ms-auth -t icore-auth:dev .
docker build -f Dockerfile.ms-upload -t icore-upload:dev .
```

**Commit:** `feat(docker): Dockerfile.ms-auth + Dockerfile.ms-upload`

---

## Task 3: docker-compose.yml + .env.docker.example

**Files:**

- Add: `docker-compose.yml`
- Add: `.env.docker.example`

- [ ] **Step 1: docker-compose.yml** — full file per spec (redis + auth + upload + gateway, healthchecks, internal `icore` network, gateway-only port mapping).

- [ ] **Step 2: .env.docker.example** — single source of truth for the four services' provider creds.

- [ ] **Step 3: Smoke**

```bash
cp .env.docker.example .env.docker   # fill creds locally
docker compose config                  # validates yaml + env interpolation
docker compose up --build              # only run if creds are available; else skip
```

**Commit:** `feat(docker): compose orchestrating gateway + auth MS + upload MS + redis`

---

## Task 4: CI docker build job

**Files:**

- Modify: `.github/workflows/pipeline.yml`

- [ ] **Step 1: Add `docker-build` job**

Runs on `push` to dev + main + PR. Builds all three Dockerfiles via `docker/build-push-action@v6` with `push: false` (just verify they build). Cached layers via `cache-from/cache-to`.

```yaml
docker-build:
  runs-on: ubuntu-latest
  needs: [build]
  strategy:
    matrix:
      image: [gateway, ms-auth, ms-upload]
  steps:
    - uses: actions/checkout@v5
    - uses: docker/setup-buildx-action@v3
    - name: Build image
      uses: docker/build-push-action@v6
      with:
        context: .
        file: Dockerfile.${{ matrix.image }}
        push: false
        cache-from: type=gha,scope=${{ matrix.image }}
        cache-to: type=gha,scope=${{ matrix.image }},mode=max
```

- [ ] **Step 2: Verify**

Push a fresh commit to a feature branch and watch the pipeline pass.

**Commit:** `ci: build Dockerfiles in matrix job on every push`

---

## Task 5: Runbook + docs + changeset

**Files:**

- Add: `docs/runbooks/local-docker.md`
- Modify: `docs/architecture.md`
- Add: `.changeset/docker-compose.md`

- [ ] **Step 1: Runbook**

```markdown
# Local Docker stack

`docker compose up` brings up gateway + auth MS + upload MS + redis with `transport=redis`. The client (Vite + your chosen template) runs outside compose for hot-reload.

## Steps

1. `cp .env.docker.example .env.docker`
2. Fill `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
3. `docker compose up --build`
4. In another terminal: `yarn nx vite:dev client-shadcn` (or antd/mui).
5. Verify gateway at `http://localhost:3001/api/docs`.

## Troubleshooting

- **`auth` service exits immediately** — usually a missing env var. Check `docker compose logs auth`.
- **Gateway can't reach Redis** — verify `AUTH_TRANSPORT=redis` + `AUTH_REDIS_URL=redis://redis:6379`. The compose file already sets these.
- **Slow first build** — Yarn cache cold; second build pulls from the layer cache.

## Rebuilding after code changes

`docker compose up --build` rebuilds the image of any service whose context changed. Faster: only target one (`docker compose up --build auth`).
```

- [ ] **Step 2: architecture.md** → Plan 11 ✅ + deliverables.

- [ ] **Step 3: Changeset**

```markdown
---
'@idevconn/create-icore': minor
---

`docker compose up` local dev stack. Three new Dockerfiles (gateway, auth MS, upload MS) using Node 24 alpine multi-stage builds. `docker-compose.yml` orchestrates the three services + a Redis broker (transport=redis); gateway is the only published port (`3001`). `.env.docker.example` documents the credentials block; `docs/runbooks/local-docker.md` walks through the boot sequence. CI gains a matrix job that builds all three Dockerfiles on every push.
```

Final verify + push.

**Commit:** `feat(create-icore): docker-compose local dev stack + Dockerfiles + CI build job`

---

## Self-Review

- Spec sections all mapped to tasks.
- No emulator stack — explicitly out of scope.
- Risk: corepack inside alpine can break on yarn version drift; tested with Yarn 4 + Node 24.
- Image size target: gateway ≤ 250MB compressed (current node-modules-heavy approach). Future improvement: prune dev deps in runtime stage.
