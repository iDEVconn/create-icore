# Third-party infrastructure audit — P0/P1 fixes

## Problem

A third-party technical audit ("Методика разработки цифровых продуктов на базе
iCore", 2026-08-27) evaluated `iDEVconn/create-icore` for use as the
infrastructure base of an external medical product. It verified 12 specific
claims against the actual repo (not just the README) and found the generator
produces a solid TypeScript/Nx monorepo skeleton, but several defaults are
unsafe or incomplete for a production deployment — because iCore is explicitly
a starting scaffold, not a hardened platform (see `README.md` framing).

All 12 claims were independently re-verified against this repo's code before
any fix was written (not taken on faith from the audit). 11/12 were confirmed
as-is; one (tokens in `apps/client/src/stores/auth.ts` via Zustand persist)
didn't apply — that file/path doesn't exist in this repo, since token storage
for the generated client lives in the external `@idevconn/api-client` package,
out of scope here.

## Solution — P0 (security, PR #275–278)

| #   | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | PR   | File(s)                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| 1   | Bull Board admin UI (`/api/admin/queues`) was mounted as raw Express middleware, bypassing the Nest `AuthGuard` entirely — publicly readable/writable queue state. Added `BullBoardAuthMiddleware`: bearer token verified via `AuthClientService`, `admin` role required.                                                                                                                                                                                                                                                                                                   | #275 | `apps/api/src/app/admin/`                                                             |
| 2   | Swagger (`/api/docs`) had no production gate — full API contract exposed unconditionally. `shouldEnableSwagger(NODE_ENV)` now skips `SwaggerModule.setup` when `NODE_ENV === 'production'`.                                                                                                                                                                                                                                                                                                                                                                                 | #276 | `apps/api/src/main.ts`, `should-enable-swagger.ts`                                    |
| 3   | Postgres auth strategy stored refresh tokens in plaintext (`_icore_sessions.refresh_token`) and had no reuse detection — a leaked DB dump or a stolen token was directly replayable, and replaying a rotated-out token only failed the single request instead of revoking the session. Refresh tokens are now stored as a SHA-256 hash (`token_hash`); a `family_id` groups tokens from one login, and replaying an already-rotated token now deletes the whole family (reuse detection). **Schema change**, no auto-migration — see the "Postgres" section of `AGENTS.md`. | #277 | `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`, `refresh-token.ts` |
| 4   | RabbitMQ transport declared queues with `durable: false` — a broker restart silently dropped queued messages. Flipped to `durable: true`.                                                                                                                                                                                                                                                                                                                                                                                                                                   | #278 | `libs/shared/src/transport.ts`                                                        |

## Solution — P1 (infra, PR #279–282)

| #   | Fix                                                                                                                                                                                                                                                                                                                                                                               | PR   | File(s)                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| 5   | `docker-compose.yml` published postgres on `5432:5432` (all interfaces) and had no persistent volumes for postgres/redis — `docker compose down` silently discarded all data. Bound postgres to `127.0.0.1:5432:5432` (host-only, `psql` from the host still works) and added named volumes `icore_postgres_data` / `icore_redis_data`.                                           | #279 | `docker-compose.yml`, `tools/create-icore/templates/docker-compose.yml`                 |
| 6   | `.nvmrc` said Node 22 while every Dockerfile and the release workflow already ran Node 24 — an untested skew between local dev and the shipped runtime. Aligned everything on Node 24 (not the other way — this was a deliberate call, see thread history: initially aimed at 22, redirected to 24 mid-fix).                                                                      | #280 | `.nvmrc`, `.github/actions/setup/action.yml`                                            |
| 7   | Scaffolded projects shipped with **zero CI/CD** — `tools/create-icore` never copied `.github` (correctly: this repo's own `pipeline.yml` publishes the `create-icore` package itself and runs scaffold smoke tests, neither applicable to a generated project). Added a thin, package-manager-agnostic `nx affected -t lint test build` pipeline as a scaffold-specific override. | #281 | `tools/create-icore/_template-shell/.github/workflows/ci.yml`, `snapshot-templates.mjs` |
| 8   | No Dockerfile existed for the React client at all (only gateway + 4 MSes did). Added `Dockerfile.client` (`node:24-alpine` build → `nginx:1.27-alpine` static runtime with SPA fallback) + `nginx.client.conf`. Verified end-to-end: scaffolded a real project, `docker build` + `docker run` + `curl` against both `/` and a deep route.                                         | #282 | `Dockerfile.client`, `nginx.client.conf`                                                |

## Side-findings (not fixed, tracked here)

- `Dockerfile.ms-payment` is not in `snapshot-templates.mjs`'s `PATHS_TO_COPY` — generated projects never receive it, unlike the other 4 Dockerfiles.
- After scaffold, `apps/client/package.json`'s `name` field stays `client-shadcn`/`client-antd`/`client-mui` — only `project.json`'s name gets normalized to `client`. Cosmetic; Nx doesn't care.

## P2 (backlog, not yet shipped as of this writing)

- Own S3-compatible (MinIO) storage strategy — no self-hosted storage option existed, only SaaS-dependent ones (Supabase/Firebase/Cloudinary) plus MongoDB GridFS.
- PWA epic for `client-shadcn` (manifest, service worker, `NetworkOnly` for `/api/*`).
- Argon2id password hashing with lazy migration of existing bcrypt hashes.

Check `git log` / open PRs for current status — this section will go stale.
