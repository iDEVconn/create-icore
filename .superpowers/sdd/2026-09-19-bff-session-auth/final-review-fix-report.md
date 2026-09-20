# Final whole-branch review — consolidated fix wave report

Branch: `feature/bff-session-auth` (PR #329 → `dev`)
Scope: all 3 Critical + all 7 Important findings from the final whole-branch
review. One wave, no second pass.

Commits (in order):

| SHA | Subject |
|---|---|
| `ec4df1a` | fix(ci,docker): add Redis service to CI check job + SESSION_REDIS_URL to both compose files |
| `92f16f0` | fix(api): populate session role, cookie-auth bull-board, @SkipCsrf, fail-fast Redis |
| `329ea95` | fix(auth): stop classifying transient provider failures as invalid_refresh_token |
| `757e046` | fix(client,create-icore): restore anonymous short-circuit, hide broken antd/mui OAuth, docs |

---

## C1 — CI red: no Redis service for the RedisSessionStore contract test

**What I did.** Added a `services:` block to the `check` job in
`.github/workflows/pipeline.yml:67-82` (between `strategy:` and `steps:`),
running `redis:7-alpine` with `ports: 6379:6379` and the standard
`redis-cli ping` healthcheck. No `REDIS_TEST_URL` is set anywhere in the job,
so the test's default `redis://localhost:6379`
(`libs/shared/src/session/__tests__/redis-session-store.contract.integration.test.ts:10`)
resolves straight to the service container. The job is `runs-on:
ubuntu-latest`, which supports service containers.

`services:` is per-job, not per-matrix-leg, so the container also starts for
the `lint` / `format:check` / `route-integrity` legs. I documented that in a
comment rather than splitting the matrix into a second job — a few seconds of
idle container is cheaper than duplicating the setup steps.

**Verification.** YAML parses (`yaml.safe_load`) and the parsed job shows the
expected `runs-on`, `services.redis`, and unchanged matrix. The test itself
passes locally against a real Redis on `localhost:6379` (an `icore-test-redis`
container was already running here), which is the same connection shape CI
will have. **Live CI verification can only happen once this is pushed** — see
Concerns.

## C2 — `SessionRecord.role` never populated (every CASL admin gate dead)

**What I did.**

1. `apps/api/src/app/auth/auth.controller.ts:75` (register), `:97` (login),
   `:190` (verifyMagicLink), `:268` (oauthCallback) now resolve the role and
   pass it into the session record. The resolution lives in one helper,
   `AuthController.resolveRole` (`auth.controller.ts:288-307`), which calls
   `this.authClient.verify(session.accessToken)` and returns `verified.role`.
   I checked `AuthClientService`'s real signature first
   (`libs/auth-client/src/lib/auth-client.service.ts:54`):
   `verify(token: string): Promise<VerifiedToken>` — matches the shape
   `adoptSession` already used, so no new plumbing.
2. `startSessionRedirect` gained a `role?: string` parameter and passes it to
   `sessionStore.create(...)` (`auth.controller.ts:328-334`) — previously it
   had no role parameter at all.
3. `apps/api/src/app/auth/auth.guard.ts:97-110`: the `updated` object built
   after a refresh no longer copies `record.role` forward. It calls
   `AuthGuard.resolveRole(refreshed.accessToken, record.role)`
   (`auth.guard.ts:118-128`), which re-reads the role from the provider and
   falls back to the old value only if `verify()` itself fails. This closes
   the parked "stale role survives a refresh" gap as a side effect.

Both helpers are **best-effort**: a `verify()` failure logs (controller) or
silently falls back (guard) rather than failing the request. That direction
fails CLOSED for authorization — no role means no `@CheckAbility` rule passes
— and avoids turning an auth-MS blip into a 500 on an otherwise-successful
login. Verified `AbilityFactory.forUser`
(`apps/api/src/app/abilities/ability.factory.ts:8`) reads exactly
`token.role === 'admin'`, so a populated record role is all that was missing.

**Tests.**
- Corrected the three assertions that encoded the bug as correct behaviour:
  `auth.controller.unit.test.ts:123, 134, 149` now expect `role: 'user'`
  (the shared mock's `verify` returns `'user'`).
- New describe block `auth.controller.unit.test.ts:159-247`: a parameterised
  test proving login / register / magic-link each persist `role: 'admin'` onto
  the stored `SessionRecord` and call `verify` with the just-issued access
  token; a matching test for `oauthCallback`; one proving a user with no role
  claim gets `undefined` (no fabricated role); one proving a failing `verify`
  still logs the user in.
- `auth.guard.unit.test.ts:62-77`: an `admin` record lands on `req.user.role`
  (the value `@CheckAbility` reads).
- `auth.guard.unit.test.ts:130-172`: role is re-resolved on refresh (admin →
  demoted to `user` at the provider is reflected in both `req.user` and the
  stored record), and a failing `verify` keeps the previous role without
  failing the request.

**Cost.** One extra `auth.verify` RPC per session creation and one per
server-side refresh. That is strictly fewer verify calls than the pre-BFF
model, which did one per request. I considered putting `role` on `AuthSession`
instead (zero extra RPC) but that changes the `AuthStrategy` contract, all four
concrete strategies, the MS controller and the contract suite — disproportionate
for this fix wave, and `adoptSession` already established the verify-based
precedent on this branch.

## C3 — `SESSION_REDIS_URL` missing from both docker-compose copies

**What I did.** Added `SESSION_REDIS_URL: redis://redis:6379` to the `gateway`
service's `environment:` block in `docker-compose.yml:127-132`, alongside the
existing `AUTH_REDIS_URL` / `UPLOAD_REDIS_URL` / `JOBS_REDIS_URL`, with a
comment noting it is a different concern from the transport URLs. Then copied
the root file verbatim over `tools/create-icore/templates/docker-compose.yml`
(the snapshot is produced by `snapshot-templates.mjs` copying the root file, so
byte-identical is the correct end state).

**Verification.** Both files parse and both expose
`services.gateway.environment.SESSION_REDIS_URL == redis://redis:6379`;
`diff` between them is empty; a `snapshot-templates.mjs` run afterwards left
the file unchanged (proving they agree).

## I4 — Supabase/Firebase misclassified transient failures as `invalid_refresh_token`

**What I did.**

- **Supabase** (`libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts:17-45,
  70-81`): added `isGenuineTokenRejection(error)`. Only a 4xx `AuthApiError`
  counts as a real rejection; `AuthRetryableFetchError` (checked by `name`,
  matching auth-js's own `isAuthRetryableFetchError` implementation), 408, 429,
  5xx and any unrecognised shape are transient and rethrow as a plain `Error`,
  so they land on `AuthGuard`'s 503 path with the session intact. I read
  `node_modules/@supabase/auth-js/dist/module/lib/errors.d.ts` to confirm
  `AuthError` exposes `status`/`code`/`name` and that the retryable class is
  distinguished by name. `!data.session` with no error keeps the old
  rejection behaviour.
- **Firebase** (`libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts:23-58,
  112-119`): `refresh()` now maps only known Identity Toolkit codes
  (`INVALID_REFRESH_TOKEN`, `MISSING_REFRESH_TOKEN`, `TOKEN_EXPIRED`,
  `USER_DISABLED`, `USER_NOT_FOUND`, `INVALID_GRANT_TYPE`) to
  `RpcException('invalid_refresh_token')` and rethrows everything else
  untouched. I checked `identity-toolkit.client.ts:97-108`: the client rethrows
  `payload.error.message` verbatim on a 4xx and synthesises
  `firebase_refresh_failed_<status>` otherwise, so matching on the message is
  the right hook, and a 5xx/network failure never contains one of those codes.
- **Mock realism**: `mock-supabase.ts:115-141`'s `refreshSession` error now
  mirrors GoTrue's actual dead-token response (`AuthApiError`, `status: 400`,
  `code: refresh_token_not_found`) instead of a bare `{ message }`. Without
  that the mock error would have been classified transient (unknown shape),
  which would have been a test artefact, not a behaviour change.

Deliberate default: an **unrecognised** error shape is treated as transient.
Cost of that choice is a dead session lingering until its 30-day Redis TTL
(already the documented, accepted failure mode); the opposite default logs out
valid users during a provider blip.

**Tests.** `supabase-auth.strategy.unit.test.ts:27-62` — four cases (retryable
fetch error, 5xx, 429, unrecognised shape) assert the thrown error is an
`Error` but **not** an `RpcException` and does not mention
`invalid_refresh_token`; the existing genuine-rejection test still passes.
`firebase-auth.strategy.unit.test.ts:36-60` — three cases (network `TypeError`,
`firebase_refresh_failed_503`, unknown provider code) assert the original error
object propagates by identity.

MongoDB and Postgres were checked and left alone: `MongoDbAuthStrategy.refresh`
only throws `RpcException` on an explicit "no such session / expired" lookup
result, and a DB outage throws out of `findOne` untouched — already correct.

## I5 — `BullBoardAuthMiddleware` still required `Authorization: Bearer`

**What I did.** Rewrote `apps/api/src/app/admin/bull-board-auth.middleware.ts`
to resolve identity the same way `AuthGuard` does: `readSessionId(req)` →
`sessionStore.get(sessionId)` (injected via `SESSION_STORE`) →
`record.role === 'admin'`. 401 for no cookie / unknown session, 403 for a
non-admin, **503** for a session-store failure (mirroring `AuthGuard`'s
"try again, not forbidden" classification). `AdminModule`
(`apps/api/src/app/admin/admin.module.ts:19-24`) imports `SessionModule` and no
longer imports `AuthModule` (the middleware no longer touches the auth MS at
all). This depends on C2 — without a populated role the check could never pass.

**One addition beyond the literal finding.** The board router bypasses the Nest
guard pipeline, so `CsrfGuard` never sees it. Under the old Bearer check that
was safe (no ambient credential); with cookie auth, bull-board's own mutating
endpoints (retry / promote / clean a job) became cross-site reachable with an
admin's ambient cookie. bull-board's bundled UI cannot be made to send
`X-CSRF-Token`, so the middleware rejects non-safe-method requests whose
`Origin` host differs from the request `Host`
(`bull-board-auth.middleware.ts:26-33, 60-69`). Same-origin requests (the board
UI itself) pass; requests without an `Origin` header pass.

**Tests.** `bull-board-auth.middleware.unit.test.ts` rewritten (8 cases): no
cookie → 401, unknown session → 401, non-admin → 403, roleless session → 403,
admin cookie → `next()` with no `Authorization` header anywhere, store failure
→ 503, cross-origin POST with a valid admin session → 403, same-origin POST →
`next()`.

**Docs.** `AGENTS.md:311` bullet rewritten to describe the session-cookie check
and the origin rule.

## I6 — `AuthBootstrap` lost the anonymous short-circuit

**What I did.** `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx:11-24`
restores the pre-branch guard, adapted to the new endpoint: if
`readCsrfCookie()` (still exported from `@icore/template-shared`) returns
`null`, call `useAuthStore.getState().logout()`, `setBooted(true)` and return
without touching the network. The CSRF cookie is set alongside `icore_sid` on
every session creation and shares its 30-day `maxAge`, so its absence means the
`GET /auth/session` could only 401 — and that request sits behind the shared
`auth-burst` throttle (10 req/60 s, shared with login/register).

Checked the OAuth path: `startSessionRedirect` sets the CSRF cookie *before*
redirecting to `/dashboard`, so the short-circuit does not break OAuth
bootstrap.

**Tests.** `auth-bootstrap.unit.test.tsx` — the two existing tests now seed
`document.cookie = 'icore_csrf=tok'` (they were exercising the network path),
plus a new test asserting that with no CSRF cookie the component renders
children, clears a stale persisted user, and `api` is **never** called.

## I7 — antd/mui shipped a broken, default-enabled OAuth button

**What I did.** `tools/create-icore/src/lib/scaffold-env.ts:300-325`:
`writeClientEnv` now computes `oauth = supported && !OAUTH_UNSUPPORTED_UI.has(opts.ui)`
where `OAUTH_UNSUPPORTED_UI = {antd, mui}`, and writes that to
`VITE_AUTH_HAS_OAUTH`. `VITE_AUTH_HAS_MAGIC_LINK` still follows the provider
alone — magic-link works on those templates (Task 8b fixed their callback
route), only OAuth is architecturally broken there.

**Tests.** `scaffold-env.unit.test.ts` — parameterised antd/mui test asserting
`VITE_AUTH_HAS_OAUTH=false` with `VITE_AUTH_HAS_MAGIC_LINK=true` on a Supabase
scaffold; a shadcn test asserting both stay `true`; an antd+postgres test
asserting both stay `false`. Existing tests (which pass no `ui` at all) still
pass — `undefined` is not in the unsupported set, so behaviour for them is
unchanged.

**Docs.** `docs/runbooks/bff-session-auth-migration.md` gap #1 gained an
"Update (final review fix wave)" paragraph stating the button is now hidden by
default for those templates and that the parity work itself is still open.

## I8 — CSRF exemption by hardcoded path allowlist

**What I did.**

1. New `apps/api/src/app/http/skip-csrf.decorator.ts` — `SKIP_CSRF_KEY` +
   `SkipCsrf()`, structurally identical to `public.decorator.ts`, with a
   doc-comment explaining why it is deliberately separate from `@Public()`.
2. `apps/api/src/app/http/csrf.guard.ts` rewritten: injects `Reflector`, checks
   `getAllAndOverride<boolean>(SKIP_CSRF_KEY, [ctx.getHandler(), ctx.getClass()])`.
   **I removed the path allowlist entirely** rather than keeping it alongside
   the decorator — two mechanisms answering the same question is the drift the
   finding objects to, and anything undecorated is now protected by default
   (fail-closed; a missing decorator breaks login loudly, it does not silently
   open a hole).
3. `@SkipCsrf()` applied to exactly the 8 handlers the allowlist covered:
   `register`, `login`, `logout`, `requestMagicLink`, `verifyMagicLink`,
   `adoptSession`, `oauthStart`, `oauthCallback`
   (`auth.controller.ts:58, 81, 116, 176, 192, 207, 244, 265`). The
   "why is logout exempt" rationale that lived in the guard's comments moved
   onto the `logout` handler. Verified via grep that `@Public()` appears
   nowhere else in `apps/api`, so no route lost an exemption it had.
4. The magic-link trailing-slash boundary bug is gone by construction — there
   is no path matching left to get the boundary wrong. (Had I kept a fallback,
   the finding's `path === '…' || path.startsWith('…/')` form was the plan.)
5. `csrf.guard.unit.test.ts` rewritten (15 cases) around a **real `Reflector`
   and the real `AuthController` handlers**: a parameterised case per exempt
   handler, the admin `revokeUser` route still rejected without a token and
   accepted with a matching pair, an arbitrary non-auth mutating route
   rejected/accepted as before, GET always allowed, and a synthetic
   `WebhookController` proving any handler can opt out — the scenario the
   finding was actually about.
6. `AGENTS.md:306` — new bullet: "`@Public()` does NOT exempt a route from
   `CsrfGuard` — add `@SkipCsrf()` too…".

## I9 — unbounded Redis retry/lock wait

**What I did.**

1. `apps/api/src/app/session/session-store.provider.ts:18-31`:
   `maxRetriesPerRequest: 3` (was `null` = infinite, copied from the BullMQ
   worker pattern), `enableOfflineQueue: false` (reject while disconnected
   instead of queueing), `connectTimeout: 5_000`.
2. `libs/shared/src/session/redis-session-store.ts:10-17, 40-53, 110-125`:
   `withRefreshLock`'s `while (true)` acquisition loop is now bounded by
   `LOCK_MAX_WAIT_MS = 2 × LOCK_TTL_MS` and throws
   `session_refresh_lock_timeout: <sessionId>` when it expires. The bound is
   overridable through a new optional constructor options object
   (`lockMaxWaitMs`) purely so the failure path is testable in ms rather than
   20 s; production callers pass nothing.
3. Third part of the finding (does a Redis failure actually reach a 503?) — it
   did **not**. `AuthGuard` only wrapped the refresh path; a rejected
   `sessionStore.get` propagated to Nest's default filter as a 500. Refactored
   into `AuthGuard.resolveSession` (`auth.guard.ts:44-72`), which wraps the
   whole store interaction and maps anything that is not already an
   `HttpException` to `ServiceUnavailableException('session_store_unavailable')`.
   `HttpException`s (the 401/503 decided inside `refreshSession`) are rethrown
   verbatim, never reclassified.

**Tests.** New `libs/shared/src/session/__tests__/redis-session-store.unit.test.ts`
(no real Redis needed): a stub whose `SET NX` always loses makes
`withRefreshLock` reject with the timeout — proving it retried and then gave up
— and never runs the release script; the success case still runs the callback
and releases. `auth.guard.unit.test.ts:174-187` asserts a throwing store
produces a `ServiceUnavailableException`. The real-Redis contract suite (which
exercises genuine lock contention) still passes.

## I10 — `logout()` could 500 before clearing cookies

**What I did.** `apps/api/src/app/auth/auth.controller.ts:113-137`: the
`sessionStore.get` + `sessionStore.delete` pair is wrapped in a try/catch that
logs and continues, matching the provider-revoke pattern directly below it.
`clearSessionCookie` + the CSRF cookie clear now always run, and the response is
always `{ ok: true }`. If `get` succeeded but `delete` threw, the best-effort
provider revoke still runs (kill the credential upstream even if our record
survives to its TTL).

**Test.** `auth.controller.unit.test.ts` — logout against a store whose `get`
and `delete` both reject still resolves `{ ok: true }` and clears both
`icore_sid` and `icore_csrf`.

---

## Test / verification output summary

| Command | Result |
|---|---|
| `nx test api` | 10 files, **89 tests passed** |
| `nx test shared` | 15 files, **90 tests passed** (incl. the 6 real-Redis contract cases + 2 new lock-bound cases) |
| `nx test auth-supabase` | 3 files, **25 passed** |
| `nx test auth-firebase` | 3 files, **24 passed** |
| `nx test client-shadcn` | 7 files, **22 passed** |
| `nx test create-icore` | 30 files, **269 passed** |
| `nx run-many -t test` (whole repo) | **36 projects, all passed** |
| `nx run-many -t lint` (whole repo) | **43 projects, 0 errors**; 10 pre-existing warnings, none in a file I touched (verified: `strategies/__tests__/auth.contract.unit.test.ts`, `strategies/fakes/fake-db.ts`, etc.) |
| `nx build` shared / api / auth-supabase / auth-firebase / create-icore | all green |
| `nx run client-shadcn:vite:build` | green |
| `yarn format:check` | "All matched files use Prettier code style!" |
| `node tools/create-icore/scripts/check-route-integrity.mjs` | ROUTE INTEGRITY OK |
| `smoke-scaffold.mjs --auth=supabase --db=supabase --upload=supabase --payment=paypal --jobs=bullmq --ai=llm-router --example=notes --transport=tcp` | **typecheck clean** (the heaviest CI combo; confirms generated projects still compile with the new `skip-csrf.decorator` + session wiring) |

Test output is clean apart from expected `Logger.warn` lines from the tests that
deliberately exercise log-and-continue paths (logout revoke failure, logout store
failure, role-resolution failure) — same class of noise the branch already had.

## Files changed

Source:

- `.github/workflows/pipeline.yml`
- `docker-compose.yml`
- `tools/create-icore/templates/docker-compose.yml`
- `apps/api/src/app/auth/auth.controller.ts`
- `apps/api/src/app/auth/auth.guard.ts`
- `apps/api/src/app/admin/bull-board-auth.middleware.ts`
- `apps/api/src/app/admin/admin.module.ts`
- `apps/api/src/app/http/csrf.guard.ts`
- `apps/api/src/app/http/skip-csrf.decorator.ts` *(new)*
- `apps/api/src/app/session/session-store.provider.ts`
- `libs/shared/src/session/redis-session-store.ts`
- `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts`
- `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`
- `apps/templates/client-shadcn/src/app/auth-bootstrap.tsx`
- `tools/create-icore/src/lib/scaffold-env.ts`

Tests:

- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`
- `apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts`
- `apps/api/src/app/admin/__tests__/bull-board-auth.middleware.unit.test.ts`
- `apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts`
- `libs/shared/src/session/__tests__/redis-session-store.unit.test.ts` *(new)*
- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts`
- `apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx`
- `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts`

Docs:

- `AGENTS.md`, `docs/runbooks/bff-session-auth-migration.md`,
  `.changeset/bff-session-auth.md`

Not committed: `docs/live-testing-supabase-accounts.md` was already untracked
before this wave started (not mine). Build-regenerated drift in
`tools/create-icore/migrations/registry.json` and the two postgres template
`package.json` files (dependency-range bumps + JSON reformatting, unrelated to
this work) was discarded twice — after the build and again after the scaffold
smoke run.

## Self-review — concerns and judgement calls

1. **C1 cannot be verified live from here.** The YAML is valid and the test
   passes against a real Redis on the same URL locally, but only a pushed run
   proves the service container comes up in time. If it flakes, the fix is a
   wait-for-port step before the test leg — the healthcheck should make that
   unnecessary.
2. **I5's origin check is an addition beyond the finding.** Making bull-board
   cookie-authenticated without it would have opened its mutating endpoints to
   cross-site requests — something the Bearer check made impossible — so I
   judged it in scope. The tradeoff: behind a reverse proxy that rewrites the
   `Host` header without rewriting `Origin`, board *actions* (not views) would
   403. Standard `proxy_set_header Host $host` setups are fine. Worth a line in
   deployment docs if anyone hits it.
3. **C2 adds one RPC per login and per refresh.** Accepted (strictly fewer than
   the pre-BFF per-request verify), and the cheaper alternative — putting
   `role` on `AuthSession` — was rejected as too wide a contract change for a
   fix wave. The refresh-time `verify` also runs *inside* the distributed lock,
   lengthening lock hold time by one RPC; the lock TTL is 10 s and the refresh
   RPC was already in there, so this is not a new class of risk, but it is a
   real (small) increase.
4. **`enableOfflineQueue: false` makes boot-window requests fail fast.** A
   request arriving in the few milliseconds between process start and the Redis
   connection being ready now gets a 503 instead of waiting. That is the
   intended direction of the fix, but it is a behaviour change worth knowing
   about for anything that hammers the gateway immediately after a deploy.
5. **I8 removed the path allowlist outright** rather than keeping it as a
   belt-and-braces fallback. The failure mode of a forgotten `@SkipCsrf()` is
   loud (login 403s) rather than silent, and the new tests assert the decorator
   on each real handler — but it is a deliberate choice, not the only one
   available.
6. **Pre-existing, adjacent, NOT fixed:** `auth=none` + `jobs=bullmq` scaffolds
   are broken today — `AUTH_ONLY_PATHS` deletes `apps/api/src/app/auth` while
   the manifest keeps `apps/api/src/app/admin`, which imported the now-deleted
   `AuthModule`. My change removes that import (an improvement), but
   `AdminModule` now imports `SessionModule`, so such a project would require
   `SESSION_REDIS_URL` at boot. The combination cannot compile today either
   way, and no CI smoke combo covers it. Out of scope, flagged here.
7. **Unknown-error-shape defaults in I4.** Supabase treats an unrecognised
   error shape as transient. If some future supabase-js version reports a dead
   token without a numeric `status`, the session would linger until its TTL
   instead of being deleted (a 503 and a confusing "service unavailable" for
   that user). I chose that over the destructive default deliberately; it
   matches the direction the finding asked for.
8. **Still unverified (unchanged from the branch's existing ledger):** no live
   provider credentials here, so none of the refresh-classification behaviour
   has been exercised against real Supabase/Firebase; and there is still no
   full-stack e2e driving the cookie flow through a browser against a running
   gateway. Both remain documented gaps in the runbook.
