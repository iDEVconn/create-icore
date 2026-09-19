# httpOnly Refresh-Cookie Auth — Design

## Problem

Both the access token and the refresh token live in `useAuthStore`
(`libs/template-shared/src/lib/stores/auth.store.ts`), a Zustand store
persisted to `localStorage` under the key `icore-auth`. Any XSS on the
client (a real risk surface — this app renders user-supplied text in
several places) can read `localStorage` directly and exfiltrate both
tokens. The refresh token is long-lived, so a stolen one grants
indefinite account access, not just a momentary window.

## Scope decisions confirmed by the user (do not re-ask)

- The design must support the client and gateway being deployed on
  **different origins** in the future, even though today they share a
  domain. This rules out a same-origin-only shortcut (plain
  `SameSite=Strict`, no CORS work) — cookies must work cross-origin
  (`SameSite=None; Secure`) and CORS must be configured with explicit
  `credentials: true` and a named origin (never a wildcard, which
  `credentials: true` rejects anyway).
- A brief loading state on every full page reload (while a silent
  refresh completes) is an acceptable trade-off — the access token is
  never persisted, so it must be re-minted from the httpOnly cookie on
  every fresh page load. No requirement for an instant, flash-free
  reload.
- The known cross-tab refresh race (see below) must be fixed as part
  of this design, not deferred.

## Architecture

**Approach chosen (of 3 discussed): hybrid token placement.** The access
token stays exactly as it is today — a short-lived JWT sent as
`Authorization: Bearer <token>` on every API call — except it now lives
in an in-memory JS variable instead of a persisted store. The refresh
token moves to an `httpOnly` cookie the browser manages entirely; no
JS on the page can ever read it, XSS or not.

This was chosen over two alternatives:

- **Full cookie session** (both tokens in cookies, no `Authorization`
  header at all) would need CSRF protection on every single mutating
  route in the app, not just one, and would require dropping
  `@idevconn/api-client` entirely rather than extending it with two
  additive config fields.
- **Do nothing structural, just shorten access-token TTL** doesn't
  address the actual ask — the refresh token would still sit in
  `localStorage`, still XSS-exfiltratable, still long-lived.

The hybrid keeps the blast radius of this change to one route
(`/auth/refresh`) needing CSRF protection, and keeps every other route
untouched — they still authenticate via the same `Authorization: Bearer`
header they always have, which isn't cookie-driven and so isn't a CSRF
target in the first place.

### Correction: `POST /auth/logout` and server-side revocation already exist

An earlier version of this design (written against a different,
downstream project) assumed this repo had no logout endpoint and no way
to revoke a session server-side. That's false for iCore itself —
verified by reading the source: `AuthStrategy.revoke(refreshToken):
Promise<void>` already exists on the interface (`libs/shared/src/
strategies/auth.ts`) and is implemented end-to-end — `FakeAuthStrategy`,
`SupabaseAuthStrategy` (exchanges the refresh token for its session,
then calls `client.auth.admin.signOut(accessToken, 'local')`), the
`auth.revoke` microservice message pattern, `AuthClientService.revoke`,
and a full contract-test suite in `libs/shared/src/strategies/
__tests__/auth.contract.unit.test.ts`. `POST /auth/logout` already
exists in `apps/api/src/app/auth/auth.controller.ts` and already calls
`this.authClient.revoke(body.refreshToken)`.

The real, narrower gap: today `logout` reads the refresh token from the
request body. Once the refresh token moves into the `icore_rt` cookie
(this design's whole point), nothing sends it in a body anymore — so
`logout` needs to read it from the cookie instead. No new strategy
method, no new microservice handler, no new gateway client method —
just switching one route's token source, mirroring `refresh`'s
cookie-driven shape.

### Cookie flags are environment-conditional

`SameSite=None` requires `Secure` per spec, and `Secure` cookies aren't
sent back over plain `http://` except for a browser-specific
`localhost` exemption that doesn't extend to other non-TLS dev hosts.
Cookie flags must therefore branch on environment: production issues
`Secure; SameSite=None`; local dev issues `SameSite=Lax` with no
`Secure`. This must be driven by config (e.g. `NODE_ENV` /
`CLIENT_ORIGIN`), never hardcoded to one branch.

### Cross-tab refresh-token rotation race — fixed via Web Locks

Supabase's `refreshSession` already rotates the refresh token on every
call (confirmed in `SupabaseAuthStrategy.refresh`, `libs/auth-strategies/
supabase/src/lib/supabase-auth.strategy.ts:53-59` — this is Supabase's
own standard behavior, not something this design changes). If two
browser tabs both hit a 401 at the same moment and both independently
POST `/auth/refresh`, the second request's refresh token has already
been invalidated by the first's rotation, and that tab gets logged out
for no real reason.

Fixed by serializing the actual refresh network call across tabs with
the Web Locks API: `navigator.locks.request('icore-auth-refresh', {mode:
'exclusive'}, async () => { ...POST /auth/refresh... })`. Because the
refresh token itself is never held in JS (only in the browser's cookie
jar, which is shared storage across tabs of the same origin), a tab
that had to wait for the lock will, once it runs, send the browser's
now-current cookie value — not a stale one it cached itself — so its
request succeeds naturally. No cross-tab message-passing of token
values is needed, only serializing *when* the requests fire.
Browsers without Web Locks support (pre-15.4 Safari) fall back to
today's single-tab in-flight-promise dedup only; the rare race in that
one case is an accepted, undocumented-elsewhere edge case, not worth a
polyfill.

### Correction: no second token consumer exists in this repo

An earlier version of this design (again, written against a different
downstream project) claimed a second, independent auth-aware fetch
wrapper at `fetch-with-refresh.ts`, used by an AI-chat SSE component
that can't go through the JSON-only `@idevconn/api-client` abstraction.
Verified via `grep`/`glob` in this session: **neither file exists
anywhere in iCore.** iCore's AI feature (`ai-orchestrator` microservice,
`/api/ai/*` gateway routes, `apps/templates/client-shadcn/src/
components/ai-usage/*`) is a plain JSON REST usage dashboard — no chart
library, no streaming/SSE fetch path — and goes through the same
`createIcoreApi` client as everything else. There is only one token
consumer to update: `libs/template-shared/src/lib/api/create-api.ts`.
If a future feature adds a raw/SSE fetch path needing its own refresh
handling, the shared `performSilentRefresh(baseUrl)` helper below is
still worth building the same way, just with only one caller today
instead of two.

### `@idevconn/api-client` needed two additive config fields — already shipped

Read the library's actual implementation (`node_modules/@idevconn/
api-client/dist/index.js`). Two hard blockers existed, neither exposed
as config:

1. Its internal `fetch()` calls (both the main request path and the
   internal `doRefresh()`) never set `credentials`, so they default to
   `'same-origin'` — cookies will never be sent cross-origin no matter
   how the gateway is configured.
2. `doRefresh()`'s POST body is fixed to `{[refreshRequestField]:
   getRefreshToken()}` with no way to attach an extra header — there is
   no hook to add the `X-CSRF-Token` header the double-submit design
   below needs.

An earlier version of this design concluded these blockers meant the
package "must be forked, not configured." **That's no longer the right
call, and turns out not to have been necessary at all:** the actual
`@idevconn/api-client` package (a separate repo at `/home/vladimir-
tkach/Projects/api-client`) already ships a `credentials` config field
(passed to every `fetch()` call) and a `getRefreshHeaders()` config
field (merged into the refresh request only) as of `0.3.3` — additive,
backward-compatible, no fork needed. Verified in this session: both
fields are present in the installed `node_modules/@idevconn/
api-client@0.3.3` and in the separate repo's own source. This repo's
`package.json` and `libs/template-shared/package.json` already pin
`^0.3.3`. `grep`-confirmed this library has exactly one consumer in
this repo — `libs/template-shared/src/lib/api/create-api.ts` — which
just needs to pass the two new fields, not be replaced.

## Components

**Backend:**

- `libs/shared/src/http/auth-cookies.ts` (new) — `setAuthCookies(res,
  {refreshToken, csrfToken})`, `clearAuthCookies(res)`,
  `readRefreshToken(req)`, `verifyCsrf(req)`. Single place owning cookie
  names (`icore_rt`, `icore_csrf`), flags, and TTL, including the
  environment-conditional `Secure`/`SameSite` branching above.
- `apps/api/src/app/auth/auth.controller.ts`:
  - `register`, `login`, `verifyMagicLink`, and the OAuth callback route
    gain a `@Res({ passthrough: true }) res: Response` parameter (where
    not already present) and call `setAuthCookies` before returning;
    their response bodies drop `refreshToken`, keeping only
    `{accessToken, user}`.
  - `refresh` is rewritten: reads the refresh token via
    `readRefreshToken(req)` (cookie, not body), calls `verifyCsrf(req)`
    (throws `ForbiddenException('csrf_mismatch')` on mismatch/missing),
    then proceeds as today; on success calls `setAuthCookies` again with
    the rotated pair.
  - `POST /auth/logout` (already exists — see the correction above):
    switch it from reading `refreshToken` off the request body to
    `readRefreshToken(req)` (the cookie), keep its existing call to
    `this.authClient.revoke(refreshToken)` unchanged, then additionally
    call `clearAuthCookies(res)`. Idempotent — a missing/already-expired
    cookie is not an error.
- No `AuthStrategy` interface change needed. `revoke(refreshToken:
  string): Promise<void>` already exists on every layer —
  `FakeAuthStrategy`, `SupabaseAuthStrategy`, the `auth.revoke`
  microservice handler, `AuthClientService.revoke` — and already has
  the right semantics: `SupabaseAuthStrategy.revoke` exchanges the
  refresh token for its current session, then calls `client.auth.
  admin.signOut(session.access_token, 'local')` (confirmed against the
  installed `@supabase/auth-js` typings: `GoTrueAdminApi.signOut(jwt,
  scope)` revokes by access-token JWT, not by refresh token — the
  strategy already does this exchange internally). `scope: 'local'`
  ends only this session/device's refresh chain, not the user's other
  active sessions elsewhere, matching "log out this browser" UX
  expectations. Errors are swallowed for idempotency.
- `apps/api/src/main.ts`: no `enableCors` call exists anywhere in this
  codebase today. Add one with an explicit `origin` (from
  `CLIENT_ORIGIN` config, never `*`) and `credentials: true` — required
  for cross-origin cookies to work at all, and harmless for the current
  same-origin deployment.

**Client:**

- `libs/template-shared/src/lib/api/access-token.ts` (new) — the access
  token as a module-level variable with a getter/setter. Not part of
  any store, not persisted. Lives in `template-shared`, not
  `apps/templates/client-shadcn`, because `create-api.ts` (which needs
  it) already lives there and Nx's dependency graph doesn't allow a
  `libs/*` package to import from an `apps/*` project.
- `libs/template-shared/src/lib/api/csrf.ts` (new) — reads the
  `icore_csrf` cookie value out of `document.cookie` (it's intentionally
  not `httpOnly`, so this is a plain string read, not a security
  boundary by itself — the boundary is the double-submit comparison
  happening server-side). Same `template-shared` placement reasoning as
  `access-token.ts`.
- `libs/template-shared/src/lib/api/silent-refresh.ts` (new) — the
  shared `performSilentRefresh(baseUrl)` helper: reads the CSRF cookie,
  POSTs `/auth/refresh` with `credentials: 'include'` and the
  `X-CSRF-Token` header, wrapped in a `navigator.locks.request(...)`
  section (falling back to an unguarded call where Web Locks isn't
  available), returns the new access token or `null`. Calls
  `setAccessToken` itself on success so every caller stays in sync.
- `create-api.ts` (`libs/template-shared/src/lib/api/create-api.ts`,
  existing — no fork needed, see the correction above): still imports
  `createApiClient` from the npm package unchanged, now passes
  `credentials: 'include'` and `getRefreshHeaders` (reading the CSRF
  cookie) — the two fields `0.3.3` already added. `getAccessToken`
  wired to the new in-memory module instead of `useAuthStore`;
  `getRefreshToken` returns a truthy placeholder (the library only uses
  it as an "is refresh possible at all" guard — the real token is never
  in JS to give it). Note this means the npm package's own internal
  refresh call does NOT go through `performSilentRefresh`'s Web Locks
  section — a known, accepted residual gap (see the implementation
  plan's Task 9), not the "fully fixed" state the Web Locks section
  above implies for every call path.
- `useAuthStore` — drops `accessToken` and `refreshToken` fields
  entirely; keeps only `user` (still persisted, so the corner
  email/avatar can render instantly on reload before the silent refresh
  resolves — this is display-only, no request depends on it).
- New `AuthBootstrap` wrapper (mounted in `apps/templates/client-shadcn/src/main.tsx`,
  wrapping `<RouterProvider>`/`<Toaster>` — `app.tsx` is an unused
  placeholder in this codebase, the real bootstrap lives in
  `main.tsx`): on mount, calls the same `performSilentRefresh`; shows a
  loading state until it resolves either way. Success populates
  `useAuthStore.user` (from the refresh response body) alongside the
  in-memory access token `performSilentRefresh` already set; failure
  (no valid cookie) proceeds straight to the unauthenticated state —
  not an error to surface to the user, just "not logged in."
- `auth.callback.tsx`, `auth.oauth.callback.tsx`, `login.tsx`: replace
  their `useAuthStore.setAuth(session)` token-carrying calls with
  `setAccessToken(session.accessToken)` for the token half;
  `useAuthStore` now only ever receives `user`.
- `LayoutHeader.tsx`'s existing `handleLogout` (currently a synchronous
  `logout(); navigate(...)`): becomes `async`, calls the new
  `POST /auth/logout` first, then clears the in-memory access token and
  `useAuthStore`'s `user`, then navigates — matching this codebase's
  existing pattern of best-effort server call before local state
  clears, not blocking navigation on the server call's success.

## Data flow

**Login / register / magic-link / OAuth (first sign-in):**
1. Client → the relevant auth endpoint, no cookies involved yet.
2. Backend authenticates via Supabase, gets `{accessToken, refreshToken,
   user}`.
3. Backend responds with `Set-Cookie: icore_rt=...; HttpOnly; Secure;
   SameSite=None; Path=/api/auth` and `Set-Cookie: icore_csrf=...;
   Secure; SameSite=None; Path=/api/auth` (not `HttpOnly` — JS must be
   able to read this one), plus body `{accessToken, user}`.
4. Client stores `accessToken` in memory, `user` in `useAuthStore`.

**Reload / new tab (silent refresh):**
1. `AuthBootstrap` on mount calls `performSilentRefresh(baseUrl)`,
   which reads `icore_csrf` from `document.cookie` and POSTs
   `/auth/refresh` with `credentials: 'include'` and
   `X-CSRF-Token: <value>`, inside a Web Locks-guarded section.
2. Backend: the browser already attached `icore_rt` automatically;
   compares the CSRF header to the CSRF cookie, calls
   `strategy.refresh(refreshToken)`, which Supabase rotates.
3. Backend re-issues both cookies with the new values, responds with
   `{accessToken, user}`.
4. `performSilentRefresh` sets the in-memory token itself;
   `AuthBootstrap` additionally populates `useAuthStore.user` from the
   response, then renders routes. No valid cookie ⇒ 401/403 ⇒ render
   the unauthenticated state directly, no error toast.

**Ordinary API call:**
- Unchanged: `Authorization: Bearer <in-memory token>`. The cookies'
  `Path=/api/auth` scoping means they are never even sent on these
  requests.
- A 401 triggers `@idevconn/api-client`'s own internal refresh (now
  passing `credentials`/`getRefreshHeaders`, not `performSilentRefresh`
  — this one call path does not go through the Web Locks section; see
  the residual-gap note above), then the existing `onUnauthorized` →
  redirect-to-login behavior on final failure, unchanged.

**Logout:**
1. `POST /auth/logout` — reads the `icore_rt` cookie directly, same as
   `refresh`; no CSRF check needed here since it's a same-purpose
   revocation, not a state-changing action an attacker would gain from
   forcing (worst case of a forged cross-site logout call is the victim
   gets logged out, not a compromised account).
2. Backend calls the existing `authClient.revoke(refreshToken)` (reads
   the token from the cookie now, not the body), then
   `clearAuthCookies(res)`.
3. Client clears the in-memory token and `useAuthStore.user`.

## Error handling

- Missing/mismatched `X-CSRF-Token` on refresh → `403
  ForbiddenException('csrf_mismatch')`.
- Missing/expired `icore_rt` cookie → `401`, reusing the strategy's
  existing `invalid_refresh_token` message.
- `POST /auth/logout` with no cookie present → succeeds silently
  (idempotent), not an error.
- Cookie flags branch on environment as described above — this is a
  config concern, not a runtime error path, but getting it wrong either
  breaks local dev (cookies silently dropped) or ships an insecure
  cookie to production, so it's called out explicitly here rather than
  left to be discovered.
- Cross-tab refresh-token rotation race: fixed via Web Locks (see
  Architecture) rather than left as a known limitation, per explicit
  user decision.

## Testing

- **Backend:** unit tests for `auth-cookies.ts`'s pure helper functions
  (set/clear/verify-CSRF) in isolation. Extend
  `auth.controller.unit.test.ts`'s existing `makeRes()` fixture (it
  already captures `res.cookie()`/`res.clearCookie()` calls) to assert
  on `res.cookies['icore_rt']` / `icore_csrf` for login/register/verify/
  refresh instead of asserting on response-body tokens. New tests for
  `refresh` (CSRF mismatch → 403, missing cookie → 401, success →
  both cookies rotate) and the new `logout` route (revocation called,
  idempotent on a missing cookie).
- **Client:** unit tests for `performSilentRefresh` (`credentials:
  'include'` and the `X-CSRF-Token` header present on the request,
  `navigator.locks.request` mocked to verify two concurrent calls
  actually serialize, `null` returned on a non-ok/network-failure
  response). Trivial unit tests for `access-token.ts` (getter/setter)
  and `csrf.ts` (cookie-string parsing, including the empty/missing
  case). No test needed for the npm package's own `credentials`/
  `getRefreshHeaders` passthrough — that's already covered by its own
  repo's test suite (already shipped, see the correction above).
- **Live Playwright (mandatory, this is a UI-behavior change per
  `AGENTS.md`):** log in → reload the page → confirm the session
  survives and `localStorage.getItem('icore-auth')` contains no token
  fields → log out → confirm a subsequent refresh attempt fails (cookie
  cleared).
