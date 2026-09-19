# Task 8 Execution Report: Frontend migration — drop the access token entirely (client-shadcn only)

## What I implemented

### `libs/template-shared` (shared, affects all three templates)
- **`src/lib/api/create-api.ts`** — replaced with the brief's Step 1 shape: `credentials: 'include'`, `getAccessToken`/`getRefreshToken` both return the `'cookie'` sentinel, `onUnauthorized` just logs out + calls the caller's hook. Dropped `accessTokenField`/`refreshTokenField`/`getRefreshHeaders`/the real `onTokenRefreshed` writer.
  - **Deviation from the brief's literal code, required to compile:** the installed `@idevconn/api-client` version's `ApiClientConfig` still declares `onTokenRefreshed` as a *required* field (not optional). The brief's Step 1 snippet omits it, which fails `tsc --noEmit` (`Property 'onTokenRefreshed' is missing`). I added a no-op `onTokenRefreshed: () => {}` with a comment explaining it can never meaningfully fire under this model (no client-driven refresh cycle exists to succeed), plus an eslint-disable for `no-empty-function` (project lint treats it as an error). This is the only place I deviated from the brief's exact code; everything else matches verbatim.
- Deleted `access-token.ts` and `silent-refresh.ts` (per the dispatcher's correction #1), plus their now-orphaned test files `__tests__/access-token.unit.test.ts` and `__tests__/silent-refresh.unit.test.ts`.
- Removed both export lines from `src/index.ts`.
- Rewrote `__tests__/create-api.unit.test.ts` — the old suite exercised the real `@idevconn/api-client` refresh→retry cycle against `/auth/refresh` (route no longer exists) and asserted on `accessTokenField`/`refreshTokenField`/`getRefreshHeaders`. Replaced with 3 focused tests: credentials/baseUrl passthrough, the `getAccessToken`/`getRefreshToken` sentinel values, and that `onUnauthorized` logs out + fires the caller's callback.
- `csrf.ts` was left untouched — it's still consumed elsewhere (kept out of scope; the antd/mui supplemental task and `csrf.guard.ts`-adjacent code still need it).

### `apps/templates/client-shadcn` (scope-limited to this template only)
- **`routes/auth.oauth.callback.tsx`** — replaced with the brief's Step 3 code verbatim (server-redirect path already sets cookies; this page only handles Supabase's implicit-flow hash fragment, adopts via `/auth/session/adopt` which now returns `{ user }` only).
- **`app/auth-bootstrap.tsx`** — rewritten per Step 5: single `GET /auth/session` call replaces the CSRF-cookie-precheck + `performSilentRefresh` dance. Kept the existing `booted`/`Loader2` loading-state structure and a `cancelled` guard for the async effect (matching the original's unmount-safety pattern).
- **`routes/_dashboard.tsx`** — the brief's file list didn't call this out, but its `beforeLoad` guard used `getAccessToken()` (deleted symbol), a call site the Step-4 grep didn't literally match (it's `getAccessToken()` used as a truthy check, not assigned). Replaced with `useAuthStore.getState().user` — the auth store already persists `user` (zustand `persist` middleware, key `icore-auth`) and is authoritatively populated by `AuthBootstrap`'s `GET /auth/session` call before any route renders, so it's the correct client-side guard signal now that there's no token to check.
- **`components/layout/LayoutHeader.tsx`** — removed the `setAccessToken(null)` call and its import on logout; kept `logout()`.
- **`routes/login.tsx`** — removed `setAccessToken` import/call in `handleLoginSuccess`; narrowed its parameter type to `{ user }` (no more `accessToken` field, matching the login response contract).
- **`components/auth/LoginForm.tsx`** — not a grep hit for `setAccessToken`/`getAccessToken` itself, but its `onSuccess` prop type and the `api<T>('/auth/login', ...)` response type both still declared `accessToken`/`refreshToken` fields that no longer exist in the response. Narrowed both to `{ user }` for correctness — otherwise the component's types would silently lie about the login response shape.
- **`routes/auth.callback.tsx`** (magic-link + Supabase implicit-flow route, separate from `auth.oauth.callback.tsx`) — removed all `setAccessToken` calls (3 call sites: hash-session adopt path, magic-link `.then()` success path) and narrowed the `/auth/session/adopt` and `/auth/magic-link/verify` response types to `{ user }` only. Kept `resolveHashSession`/`HashSession` unchanged — it still needs to extract `accessToken`/`refreshToken` from the URL hash to build the `session/adopt` **request** body; only the response shape changed.
- Updated the two affected unit tests (`auth-bootstrap.unit.test.tsx`, `LayoutHeader.unit.test.tsx`) to match: bootstrap test now mocks `@/main`'s `api` and asserts a `GET /auth/session` call instead of `performSilentRefresh`; LayoutHeader test drops the `setAccessToken` mock/assertion.
- `routes/__tests__/auth.callback.unit.test.tsx` needed no changes — it only tests `resolveHashSession`, whose shape didn't change.
- `components/auth/__tests__/LoginForm.spec.tsx` needed no changes — its `onSuccess` prop is a no-op in that suite.

## What I tested (all green)

- `yarn nx run client-shadcn:vite:build` — builds successfully (835ms / 700ms on rerun).
- `yarn nx run client-shadcn:typecheck` (`tsc --noEmit`) — clean. (Caught the `onTokenRefreshed` compile error mentioned above before I fixed it — `vite:build` alone does not typecheck, so I ran this explicitly to be sure.)
- `yarn nx run client-shadcn:test` — 7 test files, 21 tests, all pass.
- `yarn nx run template-shared:test` — 2 test files, 5 tests, all pass.
- `yarn nx run client-shadcn:lint` — 0 errors (1 pre-existing warning in `main.tsx`, unrelated to this change, not touched).
- `yarn nx run template-shared:lint` — 0 errors (after adding the eslint-disable for the required no-op).
- `yarn nx run template-shared:build` — compiles cleanly.
- `npx prettier --check` on every touched file — all already Prettier-clean (`--write` reported "unchanged" for all).
- Checked `tools/create-icore/templates/` for drift — `git status` shows none.

I did not run `yarn nx serve client-shadcn` + manual browser verification (brief's Step 6) — that requires a live backend/session and human interaction, out of scope for an unattended agent run. Build + typecheck + full test suite green is the automated substitute.

## Files changed

```
M  apps/templates/client-shadcn/src/app/__tests__/auth-bootstrap.unit.test.tsx
M  apps/templates/client-shadcn/src/app/auth-bootstrap.tsx
M  apps/templates/client-shadcn/src/components/auth/LoginForm.tsx
M  apps/templates/client-shadcn/src/components/layout/LayoutHeader.tsx
M  apps/templates/client-shadcn/src/components/layout/__tests__/LayoutHeader.unit.test.tsx
M  apps/templates/client-shadcn/src/routes/_dashboard.tsx
M  apps/templates/client-shadcn/src/routes/auth.callback.tsx
M  apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx
M  apps/templates/client-shadcn/src/routes/login.tsx
M  libs/template-shared/src/index.ts
D  libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts
M  libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
D  libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts
D  libs/template-shared/src/lib/api/access-token.ts
M  libs/template-shared/src/lib/api/create-api.ts
D  libs/template-shared/src/lib/api/silent-refresh.ts
```

**Zero `client-antd`/`client-mui` files touched** — confirmed via `git status --porcelain` before staging and again before committing.

Commit: `c7fab13` — `feat(client): drop the in-memory access token, cookie-only BFF auth`

## Self-review findings

- Both dead files deleted (`access-token.ts` and `silent-refresh.ts`) — yes, plus their orphaned tests.
- Both `index.ts` export lines removed — yes.
- Every client-shadcn call site of `setAccessToken`/`getAccessToken` updated — yes, including two sites the literal grep pattern didn't catch verbatim but were clearly in-scope dead references to the deleted symbol/contract: `_dashboard.tsx`'s `getAccessToken()` guard call, and `LoginForm.tsx`/`login.tsx`/`auth.callback.tsx`'s now-stale `accessToken`/`refreshToken` response types.
- Bootstrap rewritten to use `GET /auth/session` — yes, matches brief Step 5 pattern with the existing loading-state UI preserved.
- Build passes — yes, confirmed via both `vite:build` and `typecheck` (the latter caught a real issue the former didn't).
- Discipline: confirmed zero antd/mui paths in `git status --porcelain` both before and after staging.

## Issues / concerns

1. **Brief's Step 1 code doesn't compile as-is against the installed `@idevconn/api-client`** — `onTokenRefreshed` is a required config field in this version's `ApiClientConfig`, but the brief's snippet omits it. I added a documented no-op to satisfy the type (see above). This is a real gap between the brief and the actual library surface, not a scope question — worth flagging to whoever owns the plan in case other tasks/templates hit the same wall.
2. **`create-api.ts`'s new shape drops all CSRF header wiring** (previously `getRefreshHeaders` sent `X-CSRF-Token` on the refresh call). Per `apps/api/src/app/http/csrf.guard.ts`, mutating requests to non-public auth routes (e.g. `/api/auth/admin/revoke-user/:uid`) still require `verifyCsrf(req)` to pass, which needs an `X-CSRF-Token` header. Neither the brief's Step 1 code nor my implementation sends this header on ordinary API calls. This may be intentional (out of this task's stated scope, and the brief was explicit about the code to write) or may be a real follow-up gap — I did not investigate further since it wasn't listed in this task's scope and the brief gave exact code to implement. Flagging for whoever reviews this against Task 6/7's CSRF work.
3. Every 401 will now cause `@idevconn/api-client`'s internal refresh attempt to hit the (deleted) `/auth/refresh` route once before falling through to `onUnauthorized` — a harmless but slightly wasteful extra failed network call per 401. This is an accepted consequence of the brief's "satisfy the library's shape with a sentinel" approach, not something I introduced or was asked to fix.
