# SDD ledger — plan: docs/superpowers/plans/2026-09-19-bff-session-auth.md

Spec: docs/superpowers/specs/2026-09-19-bff-session-auth-design.md
Branch: feature/bff-session-auth (cut from origin/dev @ 3e9afb3)
Base commit for Task 1: 0f25f2b (docs commit, spec+plan added)

## Preflight scan

| Pair / Task | Produces / Consumes | Finding |
|---|---|---|
| Task1 → Task2,4,5,7 | `SessionStore`/`SessionRecord`/`NewSessionRecord`/`FakeSessionStore`/`runSessionStoreContract` from `@icore/shared` | Consistent — same names/shapes used throughout |
| Task2 → Task3 | `RedisSessionStore(redis: IORedis)` ctor | Consistent |
| Task3 → Task4,5,7 | `SESSION_STORE` DI token | Consistent |
| Task4 → Task5 | `setSessionCookie`/`clearSessionCookie`/`readSessionId` from `@icore/shared` | Consistent |
| Task5 → Task8 | `{ user }`-only response shape from every auth route | Consistent, frontend task matches |
| Task3 self-consistency | Step 4 says "import SessionModule into `app.module.ts`" | **FINDING** — read `apps/api/src/app/auth/auth.module.ts`: `AuthGuard` is registered via `APP_GUARD` **inside `auth.module.ts`**, not `app.module.ts`. `AuthController` also lives in `auth.module.ts`. Importing `SessionModule` into `app.module.ts` would NOT put `SESSION_STORE` in scope for either. |
| Task6 self-consistency | Step 4 says "register CsrfGuard... in `app.module.ts`" | **FINDING** — same misidentification; the existing `ThrottlerGuard`/`AuthGuard` `APP_GUARD` entries the step says to "confirm and add after" are in `auth.module.ts`. |
| Task5 vs AGENTS.md Clean Code | Task5 replaces every call site of `setAuthCookies`/`clearAuthCookies`/`readRefreshToken` (from `libs/shared/src/http/auth-cookies.ts`) but doesn't say to remove them from that file | **FINDING** — after Task5, those three exports (+ their now-unused `REFRESH_COOKIE`/`REFRESH_COOKIE_PATH` consts) have zero callers. `verifyCsrf`/`generateCsrfToken` stay (Task5 itself calls `generateCsrfToken`; Task6's `CsrfGuard` calls `verifyCsrf`). |
| Task7 CASL subject | `@CheckAbility('manage', 'User')` | Verified against `libs/shared/src/abilities/subjects.ts` — `'User'` is a valid `AbilitySubject`, `'manage'` a valid `AbilityAction`. No finding. |
| Task7 import path | `CheckAbility` from `'../abilities/check-ability.decorator'` | Verified against `notes.controller.ts`'s real import — exact match. No finding. |

## Rulings

Ruling: Task 3 Step 4's target file is corrected from `app.module.ts` to
`apps/api/src/app/auth/auth.module.ts` — add `SessionModule` to that
module's `imports` array (alongside the existing `AuthClientModule.forRoot()`).
`app.module.ts` needs no change for Task 3. — Why: `AuthGuard` and
`AuthController` are both declared/consumed inside `AuthModule`'s own Nest
DI scope, not the root `AppModule`'s; `SESSION_STORE` must be visible
there. — Cost if wrong: DI resolution error at boot ("Nest can't resolve
dependencies of AuthGuard/AuthController"), caught immediately by
`nx serve api` / the task's own boot-verification step, not a silent bug.

Ruling: Task 6 Step 4's target file is corrected from `app.module.ts` to
`apps/api/src/app/auth/auth.module.ts` — add
`{ provide: APP_GUARD, useClass: CsrfGuard }` to that module's existing
`providers` array, immediately after the existing `AuthGuard` entry, and
import `CsrfGuard` from `'../http/csrf.guard'`. — Why: same DI-scope
reasoning as above; the existing `ThrottlerGuard`/`AuthGuard` `APP_GUARD`
registrations Task 6 says to "confirm and add after" physically live in
`auth.module.ts`. — Cost if wrong: `CsrfGuard` never runs (registered in
the wrong module = never instantiated for these routes), silently leaving
every mutating route CSRF-unprotected — this is why the ruling is made now,
in preflight, rather than left for the task reviewer to catch after the
fact.

Ruling: Task 5 additionally removes the now-dead `setAuthCookies`,
`clearAuthCookies`, `readRefreshToken` exports and their private
`REFRESH_COOKIE`/`REFRESH_COOKIE_PATH` consts from
`libs/shared/src/http/auth-cookies.ts` once `AuthController` stops calling
them, keeping `verifyCsrf`/`generateCsrfToken`/`CSRF_COOKIE`/
`CSRF_COOKIE_PATH` (both still used, by Task 5 itself and Task 6's
`CsrfGuard`). — Why: AGENTS.md's Clean Code mandate ("actively remove
unused imports, duplicated code, and deprecated APIs"); the plan's Task 5
made these dead without saying to delete them. — Cost if wrong: three
unused exported functions linger in `@icore/shared`'s public surface —
harmless at runtime, a lint/build pass either way, but reviewed for at
Task 5's own review gate regardless.

Ruling: Task 1's Step 5 (export `runSessionStoreContract` from
`libs/shared/src/index.ts`) is corrected — it must instead be exported
from `libs/shared/src/testing.ts`, matching the existing
`runAuthContract`/`runStorageContract`/`runDBContract` convention.
Confirmed via `libs/shared/src/strategies/index.ts`'s own comment:
"the strategy contract harness ... is intentionally NOT exported [from
index.ts] ... lives behind '@icore/shared/testing'". `SessionStore`/
`SessionRecord`/`NewSessionRecord`/`FakeSessionStore` correctly stay in
`index.ts` (matches the `FakeAuthStrategy` precedent — no vitest
dependency). Every later task that imports `runSessionStoreContract`
(Task 2's `RedisSessionStore` contract test) imports it from
`@icore/shared/testing`, not `@icore/shared`. — Why: Task 1's reviewer
verified via `nx build shared` that the dist output transitively
`require()`s `vitest` from `index.js` — a real production-boundary leak,
not a style nit. — Cost if wrong: none plausible; matches 3x existing
precedent in the same file.

## Tasks

Task 1: fix round 1/5 dispatched — findings: (1) plan-mandated —
`runSessionStoreContract` exported from `index.ts` instead of `testing.ts`
(ruling above), (2) `session-store.ts:13-16` fails `prettier --check`.
Task 1: fix round 1/5 (2 addressed, 0 open; commits 2e6e0ac..fda5efb)
Task 1: complete (commits 0f25f2b..fda5efb, 1 fix round, review clean)
Task 2: security-review finding (automated, MEDIUM) — TOCTOU race in
`withRefreshLock`'s release (`redis-session-store.ts`: check-then-del is
not atomic). To be folded into Task 2's fix round alongside the task
reviewer's findings.

Ruling: Task 2's `withRefreshLock` release is corrected from the brief's
own reference code (non-atomic `GET` then `DEL`) to an atomic Lua `EVAL`
check-and-delete, overriding the plan's literal text. — Why: task reviewer
+ independent automated security review both confirmed the same TOCTOU:
if the lock's PX TTL expires between the GET and the DEL, a caller can
delete a different (newer) owner's lock. This is exactly the class of bug
token-verification was meant to close; the two-step version only narrows
the window. — Cost if wrong: none plausible — atomic Lua check-and-delete
is the textbook fix (Redis's own "Distributed Locks" guide), strictly
safer than the code it replaces.

Task 2: fix round 1/5 dispatched — findings: (1) Important — `yarn.lock`
not updated for `libs/shared`'s new `ioredis` dep, breaks CI's
`--immutable` install, (2) Important, plan-mandated — non-atomic lock
release (ruling above).
Task 2: fix round 1/5 (2 addressed, 0 open; commits ec9c819..7d3ab78)
Task 2: complete (commits fda5efb..7d3ab78, 1 fix round, review clean)
Task 3: minor (deferred): session-store.provider.ts's IORedis client doesn't
pin `protocol: 2` like the sibling `createJobsRedis` pattern does (for Lua
EVAL reply parsing safety under RESP3) — low risk since the release script
only returns a plain integer, but worth a follow-up before Task 4/5 exercise
this path under load.
Task 3: minor (deferred): redis.on('error', ...) logs every error event,
unlike createJobsRedis's dedupe-with-a-`warned`-flag pattern — noise, not
correctness.
Task 3: complete (commits 7d3ab78..e4d7432, review clean, 2 minors deferred)

Task 4: security-review finding (automated, MEDIUM) — `sameSite: 'none'`
in prod on `icore_sid` (session-cookie.ts) flagged as CSRF-enabling.
Acknowledged, not actionable now: matches the existing `icore_rt` cookie's
identical pattern (auth-cookies.ts) and is the intended tradeoff for
cross-origin cookie delivery; CSRF exposure from it is exactly what Task 6
(global CsrfGuard, double-submit icore_csrf token) exists to close. Will
re-check this finding is fully addressed once Task 6 lands.

Task 4: task reviewer finding (Important) — the guard's 401-vs-503
classification (`auth.guard.ts`'s `refreshSession`) correctly distinguishes
a genuine token rejection from a transient failure for Postgres/MongoDB
(both throw the literal `'invalid_refresh_token'`), but Supabase's and
Firebase's strategies (`libs/auth-strategies/{supabase,firebase}/...`)
throw provider-native error text on a real rejection, never that literal
string — so a genuinely dead Supabase/Firebase session gets misclassified
as a transient 503 and its stale session record is never deleted (bounded
by the 30-day Redis TTL from Task 2, not a security bypass — the session
was already dead, this just delays cleanup and shows a confusing "service
unavailable" instead of forcing re-login).

Ruling: this finding is real but its root cause lives in
`libs/auth-strategies/*`, which this plan's Global Constraints put
off-limits for Task 4 ("Do not touch `libs/auth-strategies/*`"). Rather
than force a fix that violates that scope boundary mid-task, or leave the
gap silently unaddressed, the fix is carried forward into Task 9
(per-provider live verification). This narrowly overrides the plan's
blanket auth-strategies constraint for Task 9 specifically — Task 4's own
guard code is correct and complete against its documented contract; it
does not block Task 4's completion.

**UPDATE (sharper mechanism, found by a follow-up trace):** only
`PostgresAuthStrategy.refresh` throws `RpcException('invalid_refresh_token')`
(`postgres-auth.strategy.ts:160,164,167`) — NestJS's RPC exception filter
preserves an `RpcException`'s message across the transport, so
`auth-client.service.ts`'s `mapRpcErrors` correctly maps it. Both
`MongoDbAuthStrategy.refresh` (`mongodb-auth.strategy.ts:120`) AND
`SupabaseAuthStrategy.refresh` (`supabase-auth.strategy.ts:42`) throw a
**plain `Error`** — NestJS's default RPC filter's `handleUnknownError` path
discards the message entirely, replacing it with a generic
`'Internal server error'`, and the object that crosses the transport is no
longer even `instanceof Error` by the time it reaches `auth.guard.ts`'s
catch block. So `err instanceof Error` is false, `String(err)` never
contains `invalid_refresh_token`, and the guard falls through to 503 for
BOTH Supabase (this repo's documented default provider, per AGENTS.md) AND
MongoDB — not just a wording mismatch as first framed, a structural
transport-layer scrub affecting the two most-used strategies. Firebase
unverified but almost certainly the same pattern (also throws plain
`Error`, per the earlier trace).

Task 9's fix is corrected/broadened accordingly: `MongoDbAuthStrategy.refresh`
and `SupabaseAuthStrategy.refresh` (and `FirebaseAuthStrategy.refresh` if it
also throws plain `Error` — verify) must throw `RpcException('invalid_refresh_token')`
instead of a plain `Error`, matching Postgres's existing convention exactly.
As defense-in-depth, `auth.guard.ts`'s `refreshSession` catch block should
also be hardened to extract a `.message` string from a plain
non-`Error` RPC-error object rather than gating strictly on
`err instanceof Error`, so a future strategy that still throws plain
`Error` degrades to a correct 401 rather than a silent 503. — Why: the
guard's logic is provably correct only for Postgres (1 of 4 providers, not
2 as first thought), and the gap now demonstrably affects this repo's own
documented default (Supabase) — more load-bearing than initially scoped,
still the natural fit for Task 9 (already touches auth-strategies for
per-provider verification). — Cost if wrong: unchanged in kind (dead
session read as "temporarily unavailable" instead of forced logout,
self-healing via 30-day TTL, not a security bypass) but now confirmed to
affect the default provider in every fresh iCore deployment, not an edge
case — carrying it to Task 9 guarantees it isn't forgotten.

Task 4: complete (commits e4d7432..7ee995a, review clean modulo the ruling
above, which is carried to Task 9 — not a defect in Task 4's own diff)

Task 4: security-review finding (automated, MEDIUM) — stale `role` on
session record persists across refresh. Acknowledged, covered by Task 7's
planned `deleteAllForUser` revocation on role change (AuthSession.user has
no role field to pull from during refresh anyway). Re-verify once Task 7
lands.

Task 5: minor (deferred): `CSRF_COOKIE` magic string duplicated locally in
auth.controller.ts instead of exported from auth-cookies.ts — drift risk,
not a bug.
Task 5: minor (deferred): startSession/startSessionRedirect are
near-duplicate helpers, could collapse into one.
Task 5: minor (deferred): logout's sessionStore.get/delete calls have no
error handling, unlike the best-effort revoke call right below them — a
Redis blip would fail logout before cookies clear.
Task 5: fix round 1/5 dispatched — finding: (1) Important, plan-mandated —
icore_csrf cookie has no maxAge (session-only) while icore_sid persists 30
days; once Task 6's CsrfGuard is live, closing/reopening the browser keeps
a valid session but loses CSRF protection, failing every mutating request.
Fixing now (cheap) rather than letting it surface as a Task 6/7 bug.
Task 5: fix round 1/5 (1 addressed, 0 open; commits c9a6cde..0bd28ec)
Task 5: complete (commits 7ee995a..0bd28ec, 1 fix round, review clean,
3 minors deferred)

Task 6: minor (deferred): `/api/auth/` CSRF bypass is a hardcoded
path-prefix string, inconsistent with `AuthGuard`'s `@Public()`/reflector
convention — two different "is this exempt" mechanisms now exist. Brief's
own prescribed approach, not an implementer deviation.
Task 6: confirmed pre-existing gap — no test anywhere in apps/api or
apps/api-e2e drives a real request through the full Nest guard pipeline
(no supertest/app.init()), so CsrfGuard+AuthGuard+ThrottlerGuard are
unit-tested in isolation but never verified wired together end-to-end.
Not introduced by this task; Task 10's planned Playwright E2E spec is
where this finally gets real coverage.
Task 6: complete (commits 0bd28ec..f3ee604, review clean, 2 minors deferred)
Task 6: CSRF-hole fix round (commits c0f4e35..02c8dec) re-reviewed clean —
admin route fix verified correct, fail-closed confirmed for future routes.
Minor deferred: `magic-link` prefix entry lacks a `/` boundary (unlike the
`oauth/` entry), so a hypothetical future route like
`/api/auth/magic-link-request-otp` would also bypass CSRF — not
exploitable today (no such route exists), but same class of risk as the
original bug, narrower blast radius. Worth tightening to
`path === '/api/auth/magic-link' || path.startsWith('/api/auth/magic-link/')`
in a future pass.
Task 6: fully complete including CSRF-hole fix (commits 0bd28ec..02c8dec)

Task 7: security-review finding (automated, HIGH, confirmed real) —
`revokeUser`'s `sessionStore.deleteAllForUser(uid)` only removes the app's
own `SessionRecord`s from Redis; it never revokes the underlying provider
(Supabase/Firebase/Mongo/Postgres) refresh tokens those records held. Our
own `AuthGuard` correctly rejects the now-deleted session (real kill from
this app's perspective), but the provider-level refresh token remains
live indefinitely (most providers don't self-expire a refresh token) —
inconsistent with `logout()` (Task 5), which explicitly captures the
token before deleting and best-effort-revokes it at the provider too.

Ruling: fix by changing `SessionStore.deleteAllForUser`'s return type from
`Promise<void>` to `Promise<SessionRecord[]>` (the records it deleted),
implemented in both `FakeSessionStore` and `RedisSessionStore` (Task 1/2,
already merged — reopening both for this interface change), with a
contract-test update verifying the return value. `revokeUser` (Task 7,
already merged) then best-effort-revokes each returned record's
`providerRefreshToken` via `authClient.revoke()`, mirroring `logout()`'s
try/catch-and-log pattern exactly (never let one revoke failure block the
others — use `Promise.allSettled`). — Why: this is the same defense-in
-depth this repo's own `logout()` route already established as correct;
an admin "kill this user's sessions" action that leaves live provider
credentials behind is a real, if narrow (BFF model means no browser-side
artifact survives regardless), gap — closing it costs one interface
return-type change plus mirroring existing code, not new architecture.
— Cost if wrong: `deleteAllForUser`'s only caller today is `revokeUser`
(verified — logout uses single-session `delete`, not this method), so
widening its return type has zero blast radius on other callers.
Dispatching as one consolidated fix across Tasks 1/2/7's files rather than
reopening each task separately, since it's a single coherent interface
change.
Task 7b: minor (deferred): `Promise.allSettled` in revokeUser is redundant
with the inner per-promise `.catch()` (nothing can actually reject once
caught) — `Promise.all` would behave identically. Harmless, arguably
intent-documenting, not worth churning.
Task 7b: complete (commits 02c8dec..dda1e89, review clean, 1 minor deferred)

Ruling: Task 8's file list is missing
`libs/template-shared/src/lib/api/silent-refresh.ts` — it isn't just
stylistically dead once the bootstrap is rewritten, it actively calls
`POST /auth/refresh`, a route Task 5 already deleted from the gateway
entirely (refresh is now AuthGuard's invisible server-side job). Left in
place, this file 404s the moment anything still imports/calls it. Folding
its deletion (+ its `index.ts` export line) into Task 8's dispatch,
alongside `access-token.ts`. — Why: same class of gap as the
`auth-cookies.ts` dead-code miss ruled on for Task 5 — the plan named one
file to delete but missed a second file made dead/broken by the same
change. — Cost if wrong: none plausible; the file calls a route that
provably no longer exists.

Ruling: pre-Task-8 investigation found THREE client templates
(`client-shadcn`, `client-antd`, `client-mui`) share
`libs/template-shared`. Task 8 stays scoped to `client-shadcn` only, per
the earlier ruling (repo precedent: shadcn-first, antd/mui parity as
follow-up). The antd/mui regression fix is Task 8b (dispatched
separately, not part of Task 8's own scope) — Task 8's implementer is
explicitly told not to touch antd/mui files even though the grep for
`setAccessToken`/`getAccessToken` will surface hits there.

Ruling: the plan's Self-Review section says role-change session
invalidation "belongs wherever `AuthStrategy.setRole()` is currently
invoked from an admin endpoint" in `apps/api` — checked, and no such
endpoint exists. `grep -rln "setRole"` across the repo shows `setRole` is
only called from the auth microservice's own controller
(`apps/microservices/auth/src/app/auth.controller.ts`) and `auth-client
.service.ts`'s client wrapper — no gateway-side HTTP route in `apps/api`
exposes it today. Parked, not implemented: wiring role-change invalidation
would require inventing a brand-new admin `POST /auth/admin/set-role`
gateway route, which is not a file/task this plan lists anywhere — out of
this plan's scope, not a one-line addition to an existing call site as the
self-review assumed. Task 7 implements exactly its own task body (admin
revoke-user-by-uid route) and nothing else. — Why: the self-review's
premise (an existing call site to extend) was factually wrong; inventing a
new route to satisfy it would be undocumented scope creep with its own
untested surface (new CASL check, new DTO, no brief). — Cost if wrong:
role changes made via the auth MS directly (or a future admin UI) won't
force-revoke existing sessions until this is picked up as its own future
task — a real, but pre-existing-in-spirit gap (today's model has no
role-revocation mechanism either), not a regression this plan introduces.

Task 7: complete (commits f3ee604..c0f4e35, review clean)

Task 6/7 interaction: security-review finding (automated, MEDIUM,
confirmed real) — `CsrfGuard`'s blanket `/api/auth/` prefix bypass
(Task 6) now also exempts Task 7's `POST /auth/admin/revoke-user/:uid` —
an authenticated, cookie-driven, mutating admin action — from CSRF
protection entirely. This is a live CSRF hole: a malicious page can
trigger a cross-site POST to that route using an ambient `icore_sid`
cookie, no token needed. Neither task's own review caught it because
Task 6 was reviewed before Task 7's route existed — a genuine cross-task
gap, not either task's fault in isolation. Reopening Task 6 for a fix
round rather than waiting for the final whole-branch review, given it's a
live security hole on an admin-only action.

Pre-Task-8 investigation finding — plan defect, real regression: the plan's
Task 8 (frontend migration) only lists `apps/templates/client-shadcn/*`
files. This repo actually ships THREE client templates:
`client-shadcn`, `client-antd`, `client-mui` — all three consuming the
SAME shared libs (`libs/template-shared`, incl. `create-api.ts`,
`access-token.ts`, `auth.store.ts`) and the SAME gateway (`apps/api`).
`client-antd`'s and `client-mui`'s `LoginForm.tsx` both destructure
`accessToken` from `POST /auth/login`'s response and call
`setAccessToken(session.accessToken)` — but Task 5 (already merged)
changed that response to `{ user }` only, so `session.accessToken` is now
`undefined` at runtime (no compile-time error, since `api<T>()`'s generic
type param is an unchecked cast). `_dashboard.tsx` in both templates
guards routes on `if (!getAccessToken()) throw redirect({ to: '/login' })`
— so after Task 5 landed, a successful login on antd/mui immediately
redirects back to `/login`: login is silently broken for 2 of 3 shipped
templates, by an already-merged task in this same plan. Investigated
further: neither antd nor mui has a bootstrap/silent-refresh component at
all (unlike shadcn's `auth-bootstrap.tsx` from PR #318) — their auth flow
was already weaker/behind shadcn's before this plan (no reload-survival),
so this is a pre-existing template-parity gap this plan's backend changes
merely exposed as an outright break, not created from scratch.

Ruling: Task 8 stays scoped to `client-shadcn` exactly as the plan
specifies — full BFF migration is not extended to antd/mui, matching this
repo's own established precedent (AGENTS.md: "Client dashboard shipped for
client-shadcn only... client-mui/client-antd parity is a follow-up").
However, a NEW minimal task ("Task 8b", not in the original plan, ruled
into existence here) is added: fix ONLY the regression — drop the
`setAccessToken(session.accessToken)` call from both templates'
`LoginForm.tsx` (keep `setUser(session.user)`, which still works), and
swap `_dashboard.tsx`'s guard from `getAccessToken()` to
`useAuthStore.getState().user` (already zustand-`persist`-backed, survives
reload) in both templates. This restores antd/mui to a working, if still
architecturally behind, state — not full BFF parity (no cookie-based
bootstrap/revalidation), just un-broken. — Why: shipping this plan without
this fix means every fresh `create-icore` scaffold choosing antd or mui
has broken login from day one — worse than "no parity," an active
regression this plan is responsible for since Task 5 (already merged) is
the direct cause. — Cost if wrong: none plausible — the fix only removes a
now-meaningless call and swaps one truthy-check's data source for another
already-available one; worst case is a redundant no-op if antd/mui's
`_dashboard.tsx` already happened to work some other way (it doesn't, per
the grep evidence above, but noting for completeness).
Task 4: security-review finding (automated, MEDIUM) — `sameSite: 'none'`
in prod on `icore_sid` (session-cookie.ts) flagged as CSRF-enabling.
Acknowledged, not actionable now: matches the existing `icore_rt` cookie's
identical pattern (auth-cookies.ts) and is the intended tradeoff for
cross-origin cookie delivery; CSRF exposure from it is exactly what Task 6
(global CsrfGuard, double-submit icore_csrf token) exists to close. Will
re-check this finding is fully addressed once Task 6 lands.
Task 4: security-review finding (automated, MEDIUM) — stale `role` on
session record persists across refresh (auth.guard.ts's refreshSession
preserves `record.role` unconditionally). Acknowledged as a real gap in
spirit, but the suggested fix (pull role from `refreshed.user.role`)
doesn't fit this codebase: `AuthSession.user` (refresh()'s return type,
libs/shared/src/strategies/auth.ts) only has `{ id, email }`, no `role` --
there is nothing to pull. The plan's actual mitigation is Task 7's
`deleteAllForUser` call after `setRole()`, which closes the stale-role
window by revoking the session outright rather than updating it in place.
Will re-verify this finding is fully covered once Task 7 lands.
Task 7: security-review finding (automated, HIGH) — "unenforced admin gate"
on revokeUser, claiming @CheckAbility needs an explicit @UseGuards. FALSE
POSITIVE: AbilityGuard is already registered globally via APP_GUARD in
apps/api/src/app/abilities/abilities.module.ts:7 (verified by reading the
file before Task 7 was even dispatched) -- matches the existing
notes.controller.ts convention (@CheckAbility with no local @UseGuards).
The scanner apparently didn't see abilities.module.ts. No action needed.
Task 7b: security-review finding (automated, MEDIUM) — revokeUser's
logger.warn passes the raw `err` object, potentially logging sensitive
data. Acknowledged, not fixed here: mirrors the pre-existing, already
-shipped logout() route's identical `logger.warn('logout: revoke
failed...', err)` pattern -- an established repo-wide convention, not a
regression introduced by this task. Fixing only revokeUser would be
inconsistent; a real but pre-existing logging-hygiene question for a
future, repo-wide pass, not this plan's scope.

Task 8: implementer self-flagged concern (DONE_WITH_CONCERNS), confirmed
CRITICAL by investigation: the brief's Step 1 `create-api.ts` code (copied
from this plan's own text, a defect in the PLAN itself, traced back to a
wrong assumption in the spec doc) drops `getRefreshHeaders` entirely.
Checked `@idevconn/api-client`'s actual type declarations
(`node_modules/@idevconn/api-client/dist/index.d.ts`): `getRefreshHeaders`
is documented as "merged into the refresh request ONLY" -- it never
attaches to the app's real requests (notes/payment/storage/ai/etc). Under
the OLD hybrid model this was fine because CSRF was scoped to exactly one
route (`/auth/refresh`), which was the only thing `getRefreshHeaders`
covered. Task 6 made CSRF global; nothing was added to compensate on the
frontend. Net effect: after Task 8 as literally briefed, EVERY mutating
request from client-shadcn (create note, upload, ai calls, payment
orders, admin revoke-user) gets rejected by `CsrfGuard` with 403
`csrf_mismatch` -- the entire app's write path is broken. The library
exposes no hook to attach a header to every real request (confirmed via
its full `ApiClientConfig` interface -- no `fetch` override, no per-request
header hook). This is a severe, must-fix-now finding, not deferrable to
final review.

Ruling: fix `create-api.ts` by wrapping the `ApiClient` function
`createApiClient(...)` returns, attaching `X-CSRF-Token` (via the existing
`readCsrfCookie()` from `./csrf.js`, untouched by Task 8) to every call's
headers before delegating to the real client -- not relying on
`getRefreshHeaders` at all, since it structurally cannot cover this case.
-- Why: this is the only mechanism available given the library's actual
contract; wrapping the returned function is the standard decorator
pattern for "attach a header to every call" when the library itself
doesn't expose that hook. -- Cost if wrong: none plausible -- readCsrfCookie()
already exists, is already correctly wired to read the same icore_csrf
cookie CsrfGuard checks against, and wrapping a function to inject a
header is a well-understood, low-risk pattern.
Task 8: complete (commits dda1e89..a5782ef, 1 fix round for the critical
CSRF-header plan defect, review clean)

Task 8b: implementer found larger scope than briefed (8 files, not 2 —
LoginForm.tsx + _dashboard.tsx + auth.callback.tsx [magic-link] for both
antd/mui, all sharing the identical regression, correctly verified via
auth.controller.ts that magic-link/verify shares startSession() with
login/register). Also found the regression was worse than described:
setAccessToken/getAccessToken no longer exist at all in
@icore/template-shared (deleted by Task 8), so antd/mui were failing to
COMPILE, not just silently mis-authenticating. Fixed all of the above.

Task 8b: escalated rather than guessed on auth.oauth.callback.tsx (both
templates) -- correctly identified this needs a real fix, not just a
mechanical setAccessToken removal: Task 5's oauthCallback now ALWAYS
redirects straight to `${CLIENT_ORIGIN}/dashboard` with cookies set, no
hash fragment, for the normal (non-Supabase-implicit-flow) case. Since
antd/mui have no bootstrap-equivalent component (unlike shadcn's
auth-bootstrap.tsx, which calls GET /auth/session on every app mount
regardless of how the user arrived), landing on /dashboard after a real
OAuth redirect leaves useAuthStore's `user` still null -- Task 8b's own
_dashboard.tsx guard fix (`if (!useAuthStore.getState().user)`) then
immediately bounces a genuinely-logged-in OAuth user back to /login.
Implementer left the dead setAccessToken import/call removed (compile
-safe) but did not attempt a bootstrap-equivalent, correctly judging that
BFF-parity work is out of scope per the earlier ruling.

Ruling: park this as a real, documented gap for the final whole-branch
review / the user's own decision, rather than expanding Task 8b's scope
further. OAuth is gated behind an opt-in `AUTH_HAS_OAUTH` env flag (not
enabled by default), and this is Task 5's side effect landing on 2
non-primary templates that already lack session-bootstrap infrastructure
entirely -- a narrower, more contained instance of the same "antd/mui
architecturally behind shadcn" gap already ruled on earlier, not a new
category of problem. Two real options exist (hide OAuth buttons for
antd/mui when AUTH_HAS_OAUTH is set, or a scoped follow-up task building
a minimal antd/mui bootstrap) -- neither decided here; flagging for the
final review / user sign-off rather than picking one unilaterally, since
it's a product-UX call (silently hide a feature vs. invest in parity),
not a pure correctness fix like everything else ruled on so far in this
plan. -- Cost if wrong: OAuth stays broken for antd/mui until a human
decides which path to take -- no worse than its current state, and
explicitly surfaced rather than silently shipped.
Task 8b: minor (deferred): OAuth NOTE comment duplicated verbatim across
antd/mui auth.oauth.callback.tsx instead of a shared constant -- fine for
a 2-line comment.
Task 8b: complete (commit f0c1c74, review clean, 1 minor deferred, OAuth
gap parked per earlier ruling)

Ruling: Task 9's literal plan text (burst-concurrency tests against REAL
live Supabase/Firebase/MongoDB/Postgres backends) is not executable in
this environment -- checked `apps/microservices/auth/.env` (doesn't
exist, only `.env.example`) and confirmed no live provider credentials
are configured anywhere, and this repo has no pre-existing convention for
live-provider integration tests under `libs/auth-strategies` (grepped,
zero `*.integration.test.ts` files exist there at all -- unlike Redis,
which had a real local instance to test against). Scaling Task 9 down to
its actually-achievable, actually-valuable core: the Task-4-carried-forward
error-normalization fix (`SupabaseAuthStrategy.refresh`,
`MongoDbAuthStrategy.refresh`, and `FirebaseAuthStrategy`'s
`identity-toolkit.client.ts refresh()` all currently throw a plain `Error`
on genuine token rejection -- confirmed by reading each file directly --
instead of `RpcException`, which is what `PostgresAuthStrategy.refresh`
already correctly does and the only reason Postgres's 401-vs-503
classification works today). Fix: throw `RpcException('invalid_refresh_token')`
in all three, matching Postgres's convention exactly, verified via each
strategy's own existing unit-test file/mock pattern (no live backend
needed for this -- it's a pure code-path fix, testable against each
strategy's already-existing fake/mock client). The AuthGuard's own
`err instanceof Error ? err.message : String(err)` check needs no
separate hardening once this fix lands: an `UnauthorizedException` (what
`mapRpcErrors` produces from a matched `RpcException`) IS an `Error`
instance, so the guard's existing check already works correctly post-fix
for all 4 providers -- the previously-suggested "defense-in-depth" guard
change becomes unnecessary, not skipped. -- Why: this is the real,
load-bearing part of Task 9's intent (per the spec's own "Per-Provider
Considerations" section) -- fixing the actual classification bug matters
far more than a burst-concurrency smoke test this environment can't run
anyway. -- Cost if wrong: the burst-concurrency verification itself
remains undone -- ledgered as a genuine, real limitation (not fixed, not
hidden) for the final review / a future session with real provider
credentials to pick up, not silently dropped.
Task 9: minor (deferred): new RpcException tests assert `.getError()` but
not `.message` directly, even though the guard branches on `.message` --
provably identical for a string argument (verified against RpcException's
source), not a real gap, just an implicit-equivalence nitpick.
Task 9: complete (commit 5c2e92c, review clean, 1 minor deferred). Live
burst-concurrency verification against real provider backends remains
genuinely undone -- no credentials configured in this environment, no
existing convention for it in this repo. Ledgered as a real limitation
for a future session with live credentials, not silently dropped.

Ruling: Task 10's literal plan text (a full live Playwright E2E spec:
login through the UI, mutate through all 4 feature modules, reload,
logout, replay a stale session cookie) is not buildable within this
plan's remaining scope. Investigated: `apps/templates/client-shadcn-e2e`
exists with a real Playwright config, but its `webServer` only starts the
`client-shadcn` frontend dev server -- no gateway, no auth microservice,
no Redis, nothing backend at all. `apps/api-e2e` exists as a Jest e2e
scaffold but is entirely unfilled (`passWithNoTests: true`, zero spec
files, boilerplate global-setup.ts never customized) -- confirmed this
matches Task 6's earlier finding, not new information. AGENTS.md's own
"Testing" section claims "The smoke suite spawns the gateway + both
microservices with FakeAuthStrategy + FakeStorageStrategy" -- this is
aspirational/stale documentation, not a real, working setup; no such
orchestration exists anywhere in the repo today. Building this
multi-service Playwright/Jest orchestration (spawn gateway + auth MS +
Redis + fakes, seed a test user, wire it into CI) from scratch is a
substantial, standalone infrastructure investment, disproportionate to
"finish this plan" and not something to invent unprompted at the tail of
an already-large plan.

Scoping Task 10 down to what's achievable and valuable: (1) run the
EXISTING `client-shadcn-e2e` smoke suite as a real regression check
against Task 8's `auth-bootstrap.tsx` rewrite (its "protected route
redirects to login when unauthenticated" tests now exercise a real
`fetch('/auth/session')` network failure path instead of the old
synchronous `getAccessToken()` check -- a genuine behavior change worth
confirming still passes), (2) the changeset, (3) the runbook doc, (4)
AGENTS.md update, (5) open the PR. NOT building: the full login-through
-mutate-reload-logout live spec, or any new backend-spawning e2e
infrastructure. -- Why: this gap is not a regression this plan
introduces -- AGENTS.md's e2e prose was already inaccurate before this
plan started, and this plan's own earlier tasks (unit + a handful of
integration tests against real Redis) already provide substantially more
real verification than this repo had for its auth layer before. -- Cost
if wrong: the "does this actually work end-to-end in a browser" question
remains genuinely unanswered by an automated test -- a real gap, surfaced
explicitly to the user in the final report rather than papered over with
a spec that doesn't actually exercise the backend.
Task 10: minor (deferred): new AGENTS.md bullet has no `(PR #nnn)`
reference like its siblings -- PR didn't exist yet when written; backfill
after merge for consistency.
Task 10: complete (commits 5c2e92c..ca7a868, review clean, 1 minor
deferred). PR opened: https://github.com/iDEVconn/create-icore/pull/329
(base dev, not merged, per AGENTS.md).

All 10 plan tasks + 3 supplemental fixes (Task 7b, CSRF-hole fix on
Task 6, Task 9's error-normalization) complete. Proceeding to final
whole-branch review.

## Final whole-branch review (opus, 3e9afb3..ca7a868)

Verdict: NOT ready to merge. 3 Critical, 7 Important findings. Full report
is exceptionally thorough -- see the dispatch/fix-round entries below for
the consolidated findings list. Key catches:
- C1: CI red -- redis-session-store.contract.integration.test.ts has no
  Redis service in pipeline.yml's check job.
- C2: SEVERE -- SessionRecord.role never populated on login/register/
  magic-link/OAuth (only session/adopt passes role). Every CASL admin
  gate silently dead, including this branch's OWN new admin revoke-user
  route. 3 existing unit tests assert the bug (role: undefined) as
  correct -- a green suite hid this.
- C3: both tracked docker-compose.yml copies (repo root +
  tools/create-icore/templates/) missing SESSION_REDIS_URL on the
  gateway service -- container fails to boot.
- I4: Task 9's fix over-corrected -- Supabase/Firebase now misclassify
  TRANSIENT failures (network/5xx) as invalid_refresh_token, force
  -killing sessions on a provider blip (inverts the spec's own 401-vs-503
  intent, in the destructive direction, for the default provider).
- I5: BullBoardAuthMiddleware still requires Authorization: Bearer --
  unreachable under BFF (bypasses the Nest guard pipeline by design, so
  the AuthGuard rewrite never touched it).
- I6: AuthBootstrap regression -- dropped the pre-existing
  readCsrfCookie()===null short-circuit, so every anonymous page load
  now makes a doomed network round-trip through the shared 10-req/60s
  auth-burst throttle.
- I7: antd/mui ship an OAuth button broken AND enabled by default
  (scaffold-env.ts sets VITE_AUTH_HAS_OAUTH=true regardless of template).
- I8: CSRF exemption is a hardcoded path allowlist, not the @Public()
  reflector convention -- a future webhook route will silently 403.
  Also confirmed the magic-link prefix boundary bug flagged earlier.
- I9: Redis client has no bounded retry/offline-queue setting -- a Redis
  outage hangs requests indefinitely instead of the designed 503.
- I10: logout's sessionStore calls have no error handling (elevated from
  ledger's "minor" -- reviewer says fix now, cheap and security-adjacent).

Ledger triage: reviewer re-affirmed most "follow-up" rulings as correct
(T3 redis protocol pin, T5 dedup, T9 live-verification gap, T10 no-e2e
gap), confirmed the AbilityGuard false-positive dismissal was correct via
independent verification, but elevated T5's logout error-handling and
T8b's antd/mui OAuth-parked item to must-fix-now (I10, I7) with sharper
reasoning than the original ledger entries had.

Dispatching ONE consolidated fix wave for all 3 Critical + 7 Important
findings, per SDD process (no second fix wave after this).

## Final-review fix wave (one consolidated wave, no second pass)

All 3 Critical + 7 Important findings fixed. Commits ec4df1a, 92f16f0,
329ea95, 757e046. Full per-finding record with evidence:
`.superpowers/sdd/2026-09-19-bff-session-auth/final-review-fix-report.md`.

Rulings made during the wave:

Ruling: C2's role resolution uses an extra `authClient.verify(accessToken)`
RPC at session-creation time (and on each server-side refresh) rather than
adding a `role` field to `AuthSession`. — Why: `AuthSession` is the
`AuthStrategy` contract's return type; adding a field would touch all four
concrete strategies, the auth MS controller and the contract suite, which is
disproportionate for a fix wave — and `adoptSession` already established the
verify-based precedent on this branch. Cost is one RPC per login/refresh,
strictly fewer than the pre-BFF one-per-request verify. — Cost if wrong: a
marginally slower login; the alternative remains available as a follow-up
optimisation.

Ruling: role resolution is best-effort in BOTH the controller and the guard —
a `verify()` failure degrades to `undefined` (login) or the previous role
(refresh) instead of failing the request. — Why: the credentials were just
accepted; turning an auth-MS blip into a 500 on a successful login is worse
than starting the session with no role, and no-role fails CLOSED for
authorization (no `@CheckAbility` rule passes). — Cost if wrong: a real admin
who logs in during an auth-MS blip gets a non-admin session until they log in
again; never the reverse.

Ruling: I4's unknown-error-shape default is TRANSIENT, not rejection, for both
Supabase and Firebase. — Why: misclassifying a blip as a dead token deletes
the session and logs out a valid user; misclassifying a dead token as a blip
costs a confusing 503 and a stale record that expires on its own 30-day TTL.
The asymmetry is decisive. — Cost if wrong: delayed cleanup, already the
documented failure mode.

Ruling: I8 removes the hardcoded CSRF path allowlist ENTIRELY rather than
keeping it alongside `@SkipCsrf()`. — Why: two mechanisms answering "is this
route exempt" is exactly the drift the finding objects to; a forgotten
decorator fails loudly (login 403s, caught immediately) rather than silently
leaving a hole. The magic-link trailing-slash boundary bug disappears with the
path matching itself. — Cost if wrong: none found; the new unit tests assert
the decorator on each real `AuthController` handler.

Ruling: I5 additionally rejects cross-origin MUTATING requests to the
bull-board router (Origin host vs Host), beyond the finding's literal ask. —
Why: moving the board from a Bearer header to an ambient cookie made its
retry/promote/clean endpoints cross-site reachable, and the global `CsrfGuard`
structurally cannot cover a raw Express router; bull-board's bundled UI cannot
send `X-CSRF-Token`, so the Origin header is the only available check. — Cost
if wrong: behind a reverse proxy that rewrites `Host` without rewriting
`Origin`, board actions (not views) would 403 — noted in the report.

Known, still unfixed (pre-existing, out of scope, surfaced not hidden):
`auth=none` + `jobs=bullmq` scaffolds cannot compile (the manifest keeps
`apps/api/src/app/admin` while `AUTH_ONLY_PATHS` deletes
`apps/api/src/app/auth`). This wave removed `AdminModule`'s now-unneeded
`AuthModule` import (an improvement) but introduced a `SessionModule`
dependency there, so such a project would also need `SESSION_REDIS_URL`. No CI
combo covers this pairing.

## Final whole-branch review (opus, 3e9afb3..ca7a868)

Verdict: NOT ready to merge. 3 Critical, 7 Important findings. Full report
is exceptionally thorough -- see the dispatch/fix-round entries below for
the consolidated findings list. Key catches:
- C1: CI red -- redis-session-store.contract.integration.test.ts has no
  Redis service in pipeline.yml's check job.
- C2: SEVERE -- SessionRecord.role never populated on login/register/
  magic-link/OAuth (only session/adopt passes role). Every CASL admin
  gate silently dead, including this branch's OWN new admin revoke-user
  route. 3 existing unit tests assert the bug (role: undefined) as
  correct -- a green suite hid this.
- C3: both tracked docker-compose.yml copies (repo root +
  tools/create-icore/templates/) missing SESSION_REDIS_URL on the
  gateway service -- container fails to boot.
- I4: Task 9's fix over-corrected -- Supabase/Firebase now misclassify
  TRANSIENT failures (network/5xx) as invalid_refresh_token, force
  -killing sessions on a provider blip (inverts the spec's own 401-vs-503
  intent, in the destructive direction, for the default provider).
- I5: BullBoardAuthMiddleware still requires Authorization: Bearer --
  unreachable under BFF (bypasses the Nest guard pipeline by design, so
  the AuthGuard rewrite never touched it).
- I6: AuthBootstrap regression -- dropped the pre-existing
  readCsrfCookie()===null short-circuit, so every anonymous page load
  now makes a doomed network round-trip through the shared 10-req/60s
  auth-burst throttle.
- I7: antd/mui ship an OAuth button broken AND enabled by default
  (scaffold-env.ts sets VITE_AUTH_HAS_OAUTH=true regardless of template).
- I8: CSRF exemption is a hardcoded path allowlist, not the @Public()
  reflector convention -- a future webhook route will silently 403.
  Also confirmed the magic-link prefix boundary bug flagged earlier.
- I9: Redis client has no bounded retry/offline-queue setting -- a Redis
  outage hangs requests indefinitely instead of the designed 503.
- I10: logout's sessionStore calls have no error handling (elevated from
  ledger's "minor" -- reviewer says fix now, cheap and security-adjacent).

Ledger triage: reviewer re-affirmed most "follow-up" rulings as correct
(T3 redis protocol pin, T5 dedup, T9 live-verification gap, T10 no-e2e
gap), confirmed the AbilityGuard false-positive dismissal was correct via
independent verification, but elevated T5's logout error-handling and
T8b's antd/mui OAuth-parked item to must-fix-now (I10, I7) with sharper
reasoning than the original ledger entries had.

Dispatched ONE consolidated fix wave for all 3 Critical + 7 Important
findings (commits ec4df1a..574b6b6), per SDD process (no second fix wave
after this).

## Final review fix wave (5 commits ca7a868..574b6b6) — re-review verdict

Re-reviewed by opus: ALL 10 findings (3 Critical + 7 Important) genuinely
ADDRESSED, verified against actual code (not just report claims) --
independently re-ran api/shared/auth-supabase/auth-firebase test suites,
counts matched exactly (89/90/25/24, all green). No new Critical/Important
breakage. Two findings (I5 bull-board Origin-check, I9 AuthGuard 503
mapping) were fixed beyond their literal text; both extensions verified
sound, not scope creep.

Ruling: park all residual findings below (none load-bearing, none block
merge per the re-reviewer's own verdict):

- Minor: bull-board's Origin-vs-Host CSRF substitute has an undocumented
  proxy caveat (a proxy that rewrites Host but not Origin would 403 board
  *actions* only, fail-safe). Add one sentence to the runbook. Deferred,
  not blocking.
- Minor: new csrf.guard.unit.test.ts imports auth.controller, adding one
  more file to the pre-existing (not introduced by this branch) auth=none
  scaffold breakage. Deferred with the auth=none finding below.
- Minor: Supabase's isGenuineTokenRejection classifies ANY non-408/429 4xx
  (incl. a misconfigured SUPABASE_ANON_KEY's 401) as genuine rejection --
  strictly better than pre-fix (which force-logged-out on EVERYTHING), not
  perfect. Noted, not actionable without a code-based allowlist that would
  need real Supabase error shapes to build correctly (same live-credential
  gap as Task 9's own parked limitation).
- Out-of-scope, corrected scope: `auth=none` scaffolds are typecheck
  -broken for EVERY feature combo (not just auth=none+jobs=bullmq as the
  fix-wave implementer's own report described) -- root cause is
  `scaffold-auth-none.ts`'s SHARED_INDEX_TS omitting `./http/*`/
  `./session/*`/`./security/hmac` while AUTH_ONLY_PATHS doesn't delete
  `apps/api/src/app/session`/`apps/api/src/app/http`, both of which import
  those symbols. Verified pre-existing (byte-identical at ca7a868, traces
  to d400bd0, predates this branch) and uncovered by any CI combo
  (pipeline.yml's matrix has zero auth=none entries) -- not a regression
  this branch introduced, genuinely orthogonal to all 10 findings. Ruling:
  do not fix in this round -- flagging for the user as a real, separate,
  pre-existing bug requiring its own investigation (not a quick fix; the
  actual fix needs deciding whether SHARED_INDEX_TS should keep those
  exports for auth=none, or whether AUTH_ONLY_PATHS should also strip
  apps/api/src/app/session + apps/api/src/app/http, a real design choice
  neither the original nor the final review scoped in).

Verdict: READY TO MERGE per re-reviewer. Pushed commits to update PR
#329 (ca7a868..574b6b6). CI re-triggered, not waited on indefinitely.
