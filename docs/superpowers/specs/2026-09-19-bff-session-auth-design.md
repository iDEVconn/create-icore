# BFF Server-Side Session Auth — Design

> **Status: SUGGESTION / not yet approved for execution.** Written at the
> user's request to capture a friend's architecture proposal (the pattern
> used in an existing "Marketplace" project) as a concrete spec for iCore,
> before deciding whether/when to build it. Do not start the linked plan
> without an explicit go-ahead — this doc and its plan are the "what it
> would take", not a commitment.

## Problem

`docs/superpowers/specs/2026-09-18-httponly-cookie-auth-design.md` (shipped,
PR #318) moved the **refresh** token into an httpOnly cookie but kept the
**access** token as a client-visible, in-memory Bearer value. That hybrid
model is a real improvement over the original localStorage-for-everything
design, but it still has three properties a stricter design removes:

1. The access token is JS-visible for its whole lifetime (in-memory, not
   persisted, but readable by any code running in the page — including an
   XSS payload — for as long as the tab is open).
2. Revocation is not immediate. Killing a session server-side (`revoke()`)
   stops future *refreshes*, but an already-issued access token keeps
   working until its own (short) expiry — there is a window, not a hard cutoff.
3. CSRF protection is scoped to exactly one route (`/auth/refresh`) because
   it is the only cookie-authenticated route; every other route is Bearer
   -authenticated and CSRF-immune by construction. That scoping was a
   deliberate, correct call for the hybrid model — but it does not extend to
   a design where *every* route becomes cookie-authenticated.

A friend's "Marketplace" project uses a stricter pattern for the same
problem: the **Backend-For-Frontend (BFF) token handler** pattern (the
architecture IETF's "OAuth 2.0 for Browser-Based Apps" BCP recommends, and
what Auth0/Okta/Curity ship as their reference SPA integration). This doc
specs that pattern for iCore.

## Architecture

**Approach: opaque server-side session, zero tokens in the browser.**

- The browser never sees a Supabase/Firebase/Mongo/Postgres access or
  refresh token, ever, in any form (not in memory, not in a cookie, not in a
  URL fragment). It gets exactly one artifact: an **opaque, httpOnly,
  Secure, SameSite-scoped session cookie** (`icore_sid`) — a random ID with
  no structure, useless without the server-side store behind it.
- The gateway holds a **`SessionStore`** — a new provider-agnostic interface
  (mirroring this repo's existing `AuthStrategy`/`DBStrategy`/
  `StorageStrategy` pattern) mapping `sessionId → SessionRecord` where
  `SessionRecord` holds the *provider's* access+refresh token pair, the
  user's identity, and bookkeeping (`createdAt`, `lastRefreshedAt`).
- **`AuthGuard` is rewritten** to resolve `req.user` from the session cookie
  (store lookup) instead of a Bearer header. If the stored provider access
  token is stale, the guard triggers a **single-flight, distributed**
  refresh (Redis-backed lock — see below) *before* letting the request
  proceed, updates the `SessionRecord` with the rotated pair, and only then
  authorizes the request.
- **CSRF protection now applies to every mutating route**, not just
  `/auth/refresh` — because every route that used to be Bearer-authenticated
  (CSRF-immune) is now cookie-authenticated (CSRF-exposed). This is the
  single biggest scope difference from the hybrid model: it is not an
  auth-module-only change, it touches every feature module with a
  state-changing endpoint.
- **Session revocation is immediate and centrally controllable.** Deleting
  a `SessionRecord` (logout, an admin "kick this user" action, a detected
  compromise) makes the session cookie instantly useless — there is no
  "still valid until the access token's own expiry" window, because the
  browser was never holding a token whose validity is independent of the
  store.

### Why this is a bigger scope than PR #318, precisely

PR #318 touched exactly one module (`apps/api/src/app/auth`) plus the
client's auth wiring. This design touches:

- A **new library** (`libs/session-store` or similar) — the `SessionStore`
  interface + a Redis implementation + a `FakeSessionStore` for tests,
  matching the `AuthStrategy`/`FakeAuthStrategy` precedent exactly.
- **Every** `AuthGuard`-protected mutating route across **every** feature
  module (`notes`, `payment`, `storage`, `ai`) needs the new CSRF guard —
  10 routes today (`POST /notes`, `PATCH /notes/:id`, `DELETE /notes/:id`,
  `POST /payment/orders`, `POST /payment/orders/:id/capture`,
  `POST /storage/upload`, `DELETE /storage/remove`, `POST /ai/generate`,
  `POST /ai/orchestrate`, `POST /ai/rag/query`), not just the auth module's
  own routes.
- The **entire frontend auth wiring** a second time — `access-token.ts` and
  the `Authorization: Bearer` header disappear completely; `credentials:
  'include'` becomes the *only* auth mechanism on every request.
- A **new Redis dependency for the gateway itself** (today only the
  microservices layer optionally uses Redis — as a *message transport*
  choice, `AUTH_REDIS_URL`/`UPLOAD_REDIS_URL`/etc. in `apps/api/.env.example`
  — and BullMQ jobs use it for queue state. The gateway process itself has
  never needed its own Redis connection before this).
- **Every** `AuthStrategy` implementation (`supabase`, `firebase`,
  `mongodb`, `postgres`) needs its `refresh()`/`revoke()` semantics
  re-verified under the new call pattern (server-triggered, single-flight,
  potentially concurrent across gateway replicas) — see Per-Provider
  Considerations below.

## Components

### `SessionStore` interface (new, `libs/session-store` or `libs/shared/src/session`)

```ts
export interface SessionRecord {
  sessionId: string;
  uid: string;
  email: string;
  role?: string;
  providerAccessToken: string;
  providerRefreshToken: string;
  providerAccessTokenExpiresAt: number; // epoch ms
  createdAt: number;
  lastRefreshedAt: number;
}

export interface SessionStore {
  create(record: Omit<SessionRecord, 'sessionId' | 'createdAt' | 'lastRefreshedAt'>): Promise<SessionRecord>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  /** Kills every session for a uid — admin "sign this user out everywhere" / compromise response. */
  deleteAllForUser(uid: string): Promise<void>;
  /**
   * Distributed single-flight lock around a refresh for one session.
   * Only one caller across all gateway replicas gets `fn` to run for a
   * given sessionId at a time; concurrent callers block until the winner's
   * `fn` resolves, then all see its result (not their own duplicate refresh).
   */
  withRefreshLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T>;
}
```

- `RedisSessionStore` (production): sessions as Redis hashes
  (`session:<id>`), a secondary index set per user (`user-sessions:<uid>` →
  set of sessionIds) for `deleteAllForUser`, and `withRefreshLock` via
  Redis `SET key value NX PX <ttl>` (a simple advisory lock — good enough
  at this scale; do not reach for a full Redlock library unless multi-Redis
  HA is actually in play, which it is not for this scaffold's default
  single-Redis deployment).
- `FakeSessionStore` (tests): in-memory `Map`, `withRefreshLock` implemented
  with an in-process `Map<string, Promise<unknown>>` of in-flight
  operations (good enough to test the *call contract*; the *distributed*
  property is Redis-specific and gets its own integration test against a
  real Redis, matching how `mongodb-memory-server` is used for the mongodb
  strategies today).
- Env: `SESSION_REDIS_URL` (new, dedicated — deliberately **not** reusing
  `AUTH_REDIS_URL`, which is the *transport* layer's optional
  gateway↔auth-MS message broker choice, an unrelated concern that happens
  to also be Redis-shaped).

### `AuthGuard` rewrite (`apps/api/src/app/auth/auth.guard.ts`)

Replaces the Bearer-header read with a session-cookie read + store lookup.
On a stale provider access token, calls `sessionStore.withRefreshLock` and,
inside it, `authClient.refresh(record.providerRefreshToken)` — reusing the
existing `AuthStrategy.refresh()` contract unchanged; only *who calls it and
when* changes (the guard, proactively, server-side — never the browser).

### CSRF-everywhere (new `CsrfGuard`, applied globally minus safe methods)

A global `NestJS` guard (or `APP_GUARD` provider) that runs after
`AuthGuard` and rejects any non-`GET`/`HEAD`/`OPTIONS` request whose
`X-CSRF-Token` header does not match the (still non-httpOnly) `icore_csrf`
double-submit cookie — the same double-submit primitive PR #318 already
built for `/auth/refresh` (`verifyCsrf` in `libs/shared/src/http/
auth-cookies.ts`), just promoted from a single hand-called check to a
global guard. `icore_csrf` keeps its existing `path: '/'` scoping (already
fixed in PR #318 for the identical reason: JS on any SPA route must be able
to read it).

### Frontend

- `libs/template-shared/src/lib/api/access-token.ts` — **deleted**. There
  is no in-memory access token anymore; `credentials: 'include'` is the
  only auth signal on every request.
- `create-api.ts` — drops `getAccessToken`/`onTokenRefreshed` entirely;
  keeps `getRefreshHeaders` (still needed — CSRF header on every mutating
  call now, not just refresh) and `credentials: 'include'`.
- `AuthBootstrap` simplifies to: call `GET /auth/session` on mount (does the
  `icore_sid` cookie resolve to a live session? if yes, `{user}`; if no,
  401), populate `useAuthStore.user` or not, render. No more silent-refresh
  dance client-side at all — refresh is now entirely the gateway's problem,
  invisible to the browser.
- Login/register/magic-link/OAuth/session-adopt responses drop
  `accessToken` from the body entirely (there is nothing left for the
  client to hold) — just `{user}`.

### Session revocation

- `POST /auth/logout` (already exists): delete the `SessionRecord` first
  (so the moment logout is acknowledged, the session is provably dead
  server-side — matching the proposal's "logout invalidates the server
  session first" ordering exactly), *then* call the existing
  `authClient.revoke()` (kills the provider refresh token too, defense in
  depth), *then* clear cookies.
- New: an admin-only `POST /auth/admin/revoke-user/:uid` (gated by the
  existing CASL `@CheckAbility` pattern) calling
  `sessionStore.deleteAllForUser(uid)` — the proposal's "role changes and
  session revocation take effect immediately" requirement. Role changes
  specifically: `setRole()` already exists on `AuthStrategy`; after calling
  it, also invalidate that uid's sessions so the *next* request re-resolves
  the guard's cached `SessionRecord.role`, rather than serving a stale role
  from a still-valid session for however long it has left to live.

### Distinguishing invalid session from a temporary Auth-service failure

`AuthGuard`'s store-lookup-then-maybe-refresh path can fail two structurally
different ways: (a) `sessionStore.get()` returns `null` or the record is
missing required fields — genuinely invalid/expired session, `401`; (b)
`authClient.refresh()` throws because the *auth microservice or the
upstream provider* is unreachable/erroring — a transient infra failure, not
proof the session is bad. Map (b) to `503` (`auth_service_unavailable`),
not `401` — a `401` here would force-logout a user whose session was
actually fine, just because Supabase had a blip. This distinction did not
exist in the hybrid model (a stale access token just failed to refresh and
the *client* decided what to do); in the BFF model the *gateway* is now the
one making that call, so it must make it correctly.

## Per-Provider Considerations

All four `AuthStrategy` implementations already expose identical
`refresh(refreshToken): Promise<AuthSession>` / `revoke(refreshToken):
Promise<void>` contracts — the interface does not change. What changes is
*calling pattern*: today `refresh()` is called at most once per
`/auth/refresh` HTTP request, initiated by the browser (which already
serializes itself via PR #318's client-side Web Locks / this design's
server-side `withRefreshLock`). Under this design, `refresh()` can be
called from *any* `AuthGuard`-protected request, at request-serving
latency, potentially from multiple gateway replicas concurrently for the
same session (hence `withRefreshLock` being **distributed**, not just
in-process).

- **Supabase**: `SupabaseAuthStrategy.refresh()` already rotates the
  refresh token via `client.auth.refreshSession()`. No known issue calling
  it more frequently — Supabase's own client library is designed for
  request-time refresh. Verify: does rapid, distributed-locked refresh
  trip Supabase's own rate limits under load? (Contract test with a burst
  of concurrent `withRefreshLock` calls against the *real* Supabase
  sandbox project, not just the fake — this is exactly the kind of thing
  that only shows up live, per this session's own repeated lesson today.)
- **Firebase**: `FirebaseAuthStrategy.refresh()` uses the Identity Toolkit
  REST `token` endpoint. Same rotation-per-call shape as Supabase. Verify
  quota/rate-limit behavior under the new calling frequency.
- **MongoDB**: `MongoDbAuthStrategy.refresh()` is entirely self-hosted (no
  third-party rate limit to worry about) but stores refresh tokens directly
  in MongoDB — verify `withRefreshLock`'s distributed lock actually
  prevents a double-rotation race at the *database* level too (two gateway
  replicas both passing the Redis lock gate sequentially is fine; the
  concern is whether Mongo's own read-then-write for token rotation is
  itself atomic, independent of the Redis lock being correct).
- **Postgres**: same self-hosted shape as MongoDB;
  `PostgresAuthStrategy.refresh()` already does session-family rotation
  with reuse detection (`docs` note in `AGENTS.md`: replaying an
  already-rotated-out token revokes the whole family) — this design's
  server-triggered refresh must never accidentally trigger that reuse
  -detection path against its own legitimate rotation (i.e., confirm the
  guard always uses the *latest* `SessionRecord.providerRefreshToken`,
  never a stale cached copy, when calling `refresh()`).

None of the four need new code in `libs/auth-strategies/*` — the
`AuthStrategy` interface is unchanged. This is entirely a
verification/contract-test concern per provider, not new implementation
per provider.

## Migration / Rollout

This is a **breaking change** to the auth model, not an additive one — it
fully replaces PR #318's hybrid model rather than layering on top of it.
Sessions issued under the old model (Bearer access token + `icore_rt`
cookie) have no `SessionRecord` to resolve against the new `AuthGuard`.
Options, in increasing order of complexity:

1. **Clean cutover (recommended for the scaffold's own default, and for a
   yet-unlaunched app):** ship it as a breaking change; every existing user
   session is invalidated (forced re-login) the moment this deploys. Simple,
   correct, no dual-code-path maintenance burden. Appropriate here because
   iCore itself has no production users of its own — this changes the
   *template* new projects scaffold from, not a live app's auth for existing
   users.
2. **Dual-guard bridge (only if a *downstream* project with real live users
   needs a zero-forced-logout migration):** `AuthGuard` tries the session
   cookie first, falls back to the old Bearer-header path for one release,
   lazily creating a `SessionRecord` the first time a legacy Bearer request
   succeeds. Real complexity, only justified by a real live-user constraint
   — do not build this speculatively for the scaffold itself.

This scaffold repo should take option 1. A downstream project with actual
users deciding to adopt this pattern later should re-derive its own
migration plan against its actual traffic — that is out of scope for this
spec.

## Testing

- **`SessionStore` contract tests** (`runSessionStoreContract(name, factory)`,
  matching the existing `runAuthContract`/`runStorageContract` convention):
  create/get/update/delete/deleteAllForUser round-trip correctly;
  `withRefreshLock` genuinely serializes concurrent callers (assert a
  second caller's `fn` never starts until the first's resolves) — run
  against both `FakeSessionStore` and a real Redis instance
  (`redis-memory-server` or the existing Docker Redis service already in
  `docker-compose.yml`).
- **`AuthGuard` unit tests**: valid session → `req.user` populated, no
  refresh triggered; stale provider token → refresh triggered exactly once
  even under N concurrent requests for the same session (mock
  `withRefreshLock` to prove single-flight); missing/unknown session → 401;
  `authClient.refresh()` throwing a transient-looking error → 503, not 401.
- **`CsrfGuard` unit tests**: each of the 10 identified mutating routes
  rejects a request with a missing/mismatched `X-CSRF-Token`; `GET`/`HEAD`
  requests are never gated (idempotent reads don't need CSRF protection by
  definition).
- **Per-provider live verification**: for each of the 4 `AuthStrategy`
  implementations that have a real (non-fake) backend reachable in CI or a
  dev sandbox, a burst-concurrency test against the *real* provider
  (Supabase sandbox project, a real Firebase project, a real Mongo/Postgres
  instance) exercising `withRefreshLock` under genuine concurrent load —
  this is exactly the class of bug this session's own httpOnly-cookie-auth
  work found live and never in a unit test (the `icore_csrf` Path bug, the
  Jest/MongoDB driver hang, the dead mid-session-refresh contract mismatch).
- **Full live Playwright pass**: login → make a mutating call to each of
  the 4 feature modules (notes/payment/storage/ai) → confirm CSRF header is
  attached automatically and the call succeeds → reload → confirm session
  persists with zero client-visible tokens (`localStorage` empty,
  `document.cookie` shows only `icore_sid`+`icore_csrf`, `icore_sid`
  confirmed httpOnly-invisible) → logout → confirm `deleteAllForUser`-style
  immediacy (the *same* session cookie, replayed via a raw request bypassing
  the browser, is rejected instantly — not "eventually" via natural expiry).
