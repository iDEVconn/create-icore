# Optional in-memory session store (no Redis for small projects) — design

Status: design approved in chat 2026-10-03 (spec pending review).

## Problem

The BFF session model (PR #329) made Redis mandatory: `apps/api/src/app/session/session-store.provider.ts` throws at boot without `SESSION_REDIS_URL`, and every scaffold ships a `redis` service in `docker-compose.yml`. Besides sessions, Redis is used only by BullMQ (`jobs=bullmq`) and the optional `redis` MS transport. For a small project with `--transport=tcp` and no jobs, Redis exists **only** for sessions — an extra service to run, secure and pay for.

`SessionStore` (`libs/shared/src/session/session-store.ts`) is already an interface with two implementations (Redis, and the test-only `FakeSessionStore`), so the storage can be made selectable without touching the auth flow.

## Decisions (user, 2026-10-03)

1. Explicit option `--session=redis|memory`, **default `redis`**; the wizard asks a dedicated question explaining the trade-off.
2. `memory` always logs a loud warning at boot; in `NODE_ENV=production` the gateway refuses to start unless `SESSION_STORE_ALLOW_MEMORY=true`.
3. First step is `memory` only. Out of scope: Postgres/MongoDB-backed stores, running several gateway instances on `memory`, persisting sessions to disk.

## Design

### Runtime (gateway)

- `SESSION_STORE=redis|memory`; **unset ⇒ `redis`** (existing deployments are unchanged). `redis` behaves exactly as today (requires `SESSION_REDIS_URL`, fails fast). Any other value ⇒ boot error naming the accepted values.
- New `InMemorySessionStore` in `libs/shared/src/session/in-memory-session-store.ts` (exported from `@icore/shared`). It is a real implementation, **not** the `FakeSessionStore` (which stays test-only):
  - same guarantees as the Redis store: `update()` resolves `false` for a missing session and never resurrects one, `delete()` / `deleteAllForUser()` return the records as they were at deletion, `withRefreshLock()` single-flight per session id (waiters re-read after the holder; bounded wait → error like Redis's lock timeout);
  - **expiry the Fake lacks:** sessions expire 30 days after the last `update`/`create` (matches Redis `SESSION_TTL_SECONDS`), enforced lazily on read plus a periodic sweep (`setInterval(...).unref()`, e.g. every 10 min) so a long-lived process does not accumulate dead records.
  - must pass `runSessionStoreContract` (the suite Redis and Fake already pass).
- `sessionStoreProvider` branches on `SESSION_STORE`. `memory`: `Logger.warn` — "SESSION_STORE=memory: sessions live in this process; a restart logs everyone out and only ONE gateway instance may run. Use SESSION_STORE=redis for anything else." In `NODE_ENV=production` without `SESSION_STORE_ALLOW_MEMORY=true` ⇒ throw with an actionable message.
- `BullBoardAuthMiddleware`, `AuthGuard`, controllers: unchanged (they use the `SESSION_STORE` DI token).

### Generator (`tools/create-icore`)

- `CreateIcoreOptions.session: 'redis' | 'memory'`; flag `--session`, config-file key (validated like the others), wizard question after the transport question (default `redis`), listed in the CLI README flag table.
- `validateOptions`: `authProvider=none` ⇒ the option is meaningless (no sessions at all): warn and leave compose untouched (today's behaviour).
- `.env` of the gateway (`writeGatewayEnv`): `memory` ⇒ `SESSION_STORE=memory` and the `SESSION_REDIS_URL` line removed; `redis` ⇒ unchanged.
- `docker-compose.yml` (a step next to `rewriteComposeTransport`, running after the strip passes): `memory` ⇒ gateway gets `SESSION_STORE: memory` and `SESSION_STORE_ALLOW_MEMORY: 'true'` (choosing `memory` at generation time _is_ the explicit acknowledgment — the container runs with `NODE_ENV=production`) and loses `SESSION_REDIS_URL`. The `redis` service, its `icore_redis_data` volume and the gateway's `depends_on: redis` are removed **only when nothing else needs Redis**: `jobs !== 'bullmq'` **and** `transport !== 'redis'`. Otherwise the service stays (BullMQ / the transport still need it).
- Generated README ("Quick start" / env notes) and `.env.docker.example` reflect the chosen store.
- No `create-icore migrate` entry: the default is unchanged.

### Tests

- `InMemorySessionStore`: the shared contract suite + fake-timer tests for expiry (lazy and swept), lock single-flight/timeout.
- `sessionStoreProvider`: redis (unchanged), memory (+ warning), unknown value, memory in production without / with `SESSION_STORE_ALLOW_MEMORY`.
- Generator: option parsing (flag, config file, wizard), `validateOptions` for `auth=none`, `.env` content, compose for the four cases (memory alone ⇒ Redis service gone; memory + jobs ⇒ stays; memory + `transport=redis` ⇒ stays; `redis` ⇒ untouched).
- **Install-mode scaffold smoke with `--session=memory`** (real install + build + boot with no Redis available); one memory combo added to the nightly `Scaffold Smoke Matrix`.

### Documentation (explicit task of the plan, done last)

`docs/runbooks/bff-session-auth-migration.md` (new "Choosing the session store" section; the "no in-memory fallback" statements become "no _silent_ fallback"), `docs/runbooks/local-docker.md` (Redis is no longer unconditional), `README.md` + `tools/create-icore/README.md` (flag table, stack table), `AGENTS.md` (Key Patterns / Important: the `SESSION_STORE` switch, the production guard, the "Redis is in every scaffold" bullet corrected), `docs/architecture.md`, the provider comment in `session-store.provider.ts`, and the generated project's README. A changeset (`minor`: new CLI option).

## Risks / trade-offs

- `memory` gives up two guarantees on purpose: sessions survive a restart, and more than one gateway instance can share them. Both are documented and gated (warning + production acknowledgment).
- Memory growth is bounded by the 30-day TTL + sweep, not by a size cap (YAGNI for the target projects).
- `ioredis` stays a dependency of the generated project (`libs/shared` / the provider import it); only the _service_ disappears.
