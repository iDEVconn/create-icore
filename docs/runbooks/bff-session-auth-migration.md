# BFF session auth migration

## What changed and why

iCore's auth model used to be a hybrid: a short-lived Bearer access token
held in memory/localStorage on the client, plus an httpOnly refresh-token
cookie. That model still let the client see and forward a real access
token, and CSRF protection only covered `/auth/refresh`. This branch
replaces it with a full Backend-For-Frontend (BFF) pattern: the browser
now holds a single opaque, httpOnly `icore_sid` session cookie and never
sees a provider token at all. The gateway resolves identity by looking up
`icore_sid` in a new Redis-backed `SessionStore`, and transparently
refreshes the underlying provider (Supabase/Firebase/MongoDB/Postgres)
token pair server-side, under a distributed lock, when it's close to
expiry. CSRF protection is now a global `CsrfGuard` covering every
mutating route, not just auth.

Full rationale and design: `docs/superpowers/specs/2026-09-19-bff-session-auth-design.md`.
Task breakdown and execution history: `docs/superpowers/plans/2026-09-19-bff-session-auth.md`
and `.superpowers/sdd/2026-09-19-bff-session-auth/`.

## New required env var: `SESSION_REDIS_URL`

The gateway (`apps/api`) needs its own dedicated Redis connection for the
session store, configured via `SESSION_REDIS_URL`
(`apps/api/.env.example`). This is **separate** from the optional
`AUTH_REDIS_URL` that some projects set for the gateway↔auth-MS message
transport (`AUTH_TRANSPORT=redis`) — the two point at different concerns
and may even be different Redis instances/databases.

`sessionStoreProvider` (`apps/api/src/app/session/session-store.provider.ts`)
throws at boot if `SESSION_REDIS_URL` is unset — there is deliberately no
in-memory fallback. Unlike other optional per-feature Redis usages in this
repo, a session store that loses its data on a gateway restart would
silently log out every logged-in user, so the factory fails fast instead.

Add `SESSION_REDIS_URL=redis://localhost:6379` (or your managed Redis URL)
to every gateway `.env`/deployment config before deploying this branch.

## Forced re-login on deploy

Every session is invalidated the moment this deploys. Sessions issued
under the old hybrid model have no `SessionRecord` in the new
Redis-backed `SessionStore` for the rewritten `AuthGuard` to resolve
against — old Bearer tokens and old refresh cookies simply won't map to
anything. Every user, on every client (`client-shadcn`, `client-antd`,
`client-mui`), will be redirected to `/login` on their next request after
deploy. This is expected, not a bug — plan the deploy window accordingly
and communicate it if the project has real users.

## Rollback

Reverting this PR restores the prior hybrid Bearer + httpOnly-refresh-cookie
model. No persistent-store schema or data migration is involved anywhere
in this change — `SessionRecord`s live only in Redis as ephemeral state,
not in Postgres/Supabase/Firestore/Mongo, so there is nothing to migrate
back. A rollback simply stops writing/reading `icore_sid` sessions;
existing Redis session keys are harmless leftovers that expire on their
own TTL.

## Known, deliberately-parked gaps

Being explicit about what this work does **not** cover, rather than
glossing over it:

1. **`client-antd` / `client-mui` OAuth login remains non-functional.**
   Both templates' OAuth buttons (`LoginForm.tsx`) still redirect to
   `/api/auth/oauth/{google,github}` and land on an
   `auth.oauth.callback` route, but neither template has a
   session-bootstrap mechanism analogous to `client-shadcn`'s
   `AuthBootstrap` (`GET /auth/session` on mount). This is a pre-existing
   infrastructure gap in those two templates, not something introduced or
   fixed here. A real product decision is needed — hide the OAuth buttons
   on those templates until parity is built, or build the bootstrap
   parity — and that decision was explicitly not made as part of this
   work.
2. **Live burst-concurrency verification was not performed against real
   provider backends.** The refresh-error-normalization fix (each
   `AuthStrategy.refresh()` now throws a consistent `RpcException` shape)
   is implemented and unit-tested, and the distributed-lock refresh path
   has unit/contract-level coverage, but none of it has been exercised
   against a live Supabase, Firebase, MongoDB, or Postgres backend under
   concurrent refresh load — no credentials for any of those providers are
   configured in this dev environment. Treat this as unverified in
   production-like conditions until it is.
3. **No full-stack e2e test exercises the new session-cookie flow
   end-to-end through a real browser against a real running gateway.**
   `apps/templates/client-shadcn-e2e`'s Playwright config only starts the
   frontend dev server (no gateway, no auth microservice, no Redis), and
   `apps/api-e2e` is an unfilled Jest scaffold (`passWithNoTests: true`,
   zero spec files). This is a pre-existing gap in this repo's e2e
   infrastructure, not something this branch introduced — building real
   multi-service e2e orchestration (gateway + auth MS + Redis + a
   fake/stub provider) is a separate, larger effort.

## Regression check performed

The existing Playwright smoke suite
(`apps/templates/client-shadcn-e2e/src/icore.spec.ts`) was run
(`yarn nx e2e client-shadcn-e2e`) to confirm Task 8's rewrite of
`AuthBootstrap` (calling `GET /auth/session` on every mount instead of a
synchronous local check) doesn't make the "protected route redirects to
login when unauthenticated" assertions slow or flaky now that they
exercise a real (failing) network fetch. All 4 spec cases pass on
Chromium in under 2 seconds — the fetch to `/auth/session` fails fast
(`ECONNREFUSED` via the Vite dev proxy, since no gateway runs in this e2e
config) and `AuthBootstrap`'s `catch` branch resolves the boot state
immediately. Firefox/webkit runs in the same suite failed only because
those browser binaries aren't installed in this environment
(`yarn playwright install`) — unrelated to this change.
