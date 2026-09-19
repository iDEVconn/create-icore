# Task 9 Report — rewire `create-api.ts`

## What was implemented

Rewrote `libs/template-shared/src/lib/api/create-api.ts` exactly per the brief's target snippet:

- Added `credentials: 'include'` to the `createApiClient` config.
- `getAccessToken` now reads from the in-memory `getAccessToken()` (Task 8's `access-token.ts`) instead of `useAuthStore.getState().accessToken`.
- `getRefreshToken` returns the literal string `'cookie'` — a truthy guard only; the real refresh token now lives solely in the httpOnly cookie and is never touched by JS.
- Added `getRefreshHeaders`, reading `readCsrfCookie()` (Task 8's `csrf.ts`) and returning `{ 'X-CSRF-Token': csrf }` when present, `{}` otherwise.
- Dropped `refreshRequestField` and `refreshTokenField` (no longer apply — response body is now `{accessToken, user}` only). Kept `accessTokenField: 'accessToken'`. Updated the adjacent comment to reflect this (per the brief's target).
- `onTokenRefreshed` now only calls `setAccessToken(accessToken)` (previously it also called `useAuthStore.getState().setAuth(...)` with a `refreshToken` field, which no longer exists in the response).
- `onUnauthorized` now calls `setAccessToken(null)` first, then the existing `useAuthStore.getState().logout()` and `opts.onUnauthorized?.()`.

One deviation from the brief's literal snippet, required to keep `tsc` green: `getRefreshHeaders` needed an explicit `(): Record<string, string> =>` return-type annotation. Without it, TypeScript inferred the ternary's two branches (`{ 'X-CSRF-Token': csrf }` vs `{}`) as a union where the `{}` branch effectively became `{ 'X-CSRF-Token'?: undefined }`, which fails structural assignability against `@idevconn/api-client`'s `getRefreshHeaders?: () => Record<string, string>` type (TS2322: `undefined` not assignable to the index signature's `string`). The runtime behavior is identical to the brief's snippet — only a type annotation was added, no logic changed.

## Known Web-Locks residual gap (carried forward, not closed)

Confirmed and explicitly flagging per the brief's instruction: this task does **not** route `create-api.ts` through `performSilentRefresh`/Web Locks (Task 8's `silent-refresh.ts`). The underlying `@idevconn/api-client` library (v0.3.3) still owns its own internal refresh-on-401 implementation, unguarded by Web Locks — only `AuthBootstrap`'s boot-time refresh call (Task 11, not yet implemented) will go through `performSilentRefresh`. Task 1's `credentials`/`getRefreshHeaders` additions to the library are passthrough config only, not a pluggable refresh implementation, so wiring `performSilentRefresh` into `create-api.ts` would require a larger architectural change than this task scopes. This is a known, accepted gap versus the spec's "fixed via Web Locks" framing (two nearly-simultaneous refresh calls — boot-time vs. a live 401 — could theoretically race; worst case is an extra login prompt in one tab, not a security issue). I did not attempt to close it.

## Test suite results

Both suites full green, run twice (before and after the type-annotation fix):

- `yarn nx test template-shared`: 4 test files, 11 tests passed (`access-token.unit.test.ts`, `create-api.unit.test.ts`, `csrf.unit.test.ts`, `silent-refresh.unit.test.ts`).
- `yarn nx test client-shadcn`: 4 test files, 10 tests passed (`app.spec.tsx`, `UpdatePrompt.spec.tsx`, `OfflineBanner.spec.tsx`, `LoginForm.spec.tsx`). One pre-existing, unrelated `react-i18next` stderr warning (`NO_I18NEXT_INSTANCE`) in `LoginForm.spec.tsx` — not caused by this change, test still passes.

## Test file fixed and why

`libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts` — its single test asserted `createApiClient` was called with `refreshRequestField`/`refreshTokenField`/`accessTokenField`, all tied to the old `useAuthStore`-sourced refresh-token contract. Since `refreshRequestField`/`refreshTokenField` are dropped by this task, I:

- Kept an assertion for `accessTokenField: 'accessToken'` (renamed the `it` block to reflect it's now access-token-only).
- Added a second test asserting the new contract: `credentials: 'include'`, and that `getAccessToken`/`getRefreshToken`/`getRefreshHeaders` are functions (config passthrough shape, not implementation detail — this test doesn't reach into `useAuthStore` internals).

No other test files reference `useAuthStore`'s `accessToken`/`refreshToken` fields directly — grepped both `libs/template-shared` and `apps/templates/client-shadcn` for `useAuthStore`/`accessToken`/`refreshToken` in `*.test.ts*` files; only `create-api.unit.test.ts` (fixed above) and `silent-refresh.unit.test.ts` matched, and the latter doesn't touch `useAuthStore` or `create-api.ts` at all (it tests `performSilentRefresh` directly against a mocked `fetch`), so it needed no changes.

## Files changed

- `libs/template-shared/src/lib/api/create-api.ts` (source rewrite)
- `libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts` (test updated for new contract)

Confirmed `tools/create-icore/templates/libs/template-shared/src/lib/api/create-api.ts` (the generated-template copy) was NOT touched — consistent with Task 8's precedent (commit 13837f9 only touched `libs/template-shared/src/...`) and the standing note that `tools/create-icore/templates/` is a build artifact, not hand-maintained source.

## Self-review findings

- **Completeness:** all fields from the brief's target snippet present (`credentials`, `getAccessToken`, `getRefreshToken`, `getRefreshHeaders`, `accessTokenField`, `onTokenRefreshed`, `onUnauthorized`); nothing extra beyond the one necessary type annotation.
- **Quality:** comment style matches the file's existing convention (block comment above the field it documents); the brief's updated comment about response-body shape (`{accessToken, user}` only) was carried over verbatim.
- **Discipline:** no attempt to wire `performSilentRefresh` into `create-api.ts` — confirmed out of scope per the brief's explicit note, flagged above instead.
- **Testing:** both `template-shared` and `client-shadcn` full suites pass, output pristine (only the pre-existing unrelated i18next warning). Also ran `yarn nx lint template-shared` (clean), `yarn nx lint client-shadcn` (0 errors, 1 pre-existing warning in `main.tsx` unrelated to this change), `yarn nx build template-shared` (pass), `yarn nx run client-shadcn:vite:build` (pass — `client-shadcn` has no plain `build` target; its real build target is `vite:build`, per `AGENTS.md`'s note on `Dockerfile.client`), and `yarn nx run client-shadcn:typecheck` (pass) for extra confidence.

## Concerns

None blocking. Two minor notes:

1. The brief's Step 3 command list says `yarn nx build client-shadcn`, but that target doesn't exist on this project — I used `yarn nx run client-shadcn:vite:build` instead (verified via `nx show project client-shadcn --json`), consistent with `AGENTS.md`'s existing documentation of this project's real build target.
2. The Web-Locks residual gap described above remains open by design — this is expected per the brief, not a regression introduced by this task.
