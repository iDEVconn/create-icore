# Task 10 Report — trim `useAuthStore`, rewire callback routes

## Status: DONE_WITH_CONCERNS (see Concerns — brief prose diverged materially from live code, but the mechanical migration is complete and verified green)

## What I implemented, file by file

1. **`libs/template-shared/src/lib/stores/auth.store.ts`** — replaced wholesale, exactly per the brief's Step 1 target:
   - `AuthState` no longer has `accessToken`/`refreshToken`.
   - `setAuth({accessToken, refreshToken, user})` renamed to `setUser(user: AuthUser)`.
   - `logout()` now just clears `user`.
   - Added `useIsAdmin()` (didn't exist before in this file at all — it's new, per the brief's exact target content, not a pre-existing function I preserved).

2. **`apps/templates/client-shadcn/src/routes/auth.callback.tsx`** — imported `setAccessToken` from `@icore/template-shared`; destructured `setUser` instead of `setAuth`; the single `setAuth(session)` call (magic-link verify success) became `setAccessToken(session.accessToken); setUser(session.user);`.

3. **`apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx`** — imported `setAccessToken`; destructured `setUser`; removed `const refreshToken = params.get('refreshToken')` and dropped it from the guard clause (`if (!accessToken || !userId || !email)`); replaced `setAuth({accessToken, refreshToken, user: {...}})` with `setAccessToken(accessToken); setUser({id: userId, email});`.

4. **`apps/templates/client-shadcn/src/routes/login.tsx`** — imported `setAccessToken`; destructured `setUser`; `handleLoginSuccess`'s inline parameter type dropped `refreshToken: string`; `setAuth(session)` became `setAccessToken(session.accessToken); setUser(session.user);`.

5. **`apps/templates/client-shadcn/src/routes/_dashboard.tsx`** (not in the brief's file list, but required — see Concerns) — its `beforeLoad` guard read `useAuthStore.getState().accessToken`, a field this task deletes from `AuthState`. This would have been a TypeScript compile error (`Property 'accessToken' does not exist on type 'AuthState'`), breaking `yarn nx build client-shadcn`. Fixed per the brief's own Step 7 instruction ("fix any remaining accessToken/refreshToken store references … not explicitly listed") by switching to `getAccessToken()` from `@icore/template-shared` (the in-memory token, which is what actually gates protected routes now).

## Brief-vs-live-code divergence (read carefully before trusting future briefs in this plan)

The brief's prose for Steps 2–6 described a codebase state that does **not** match what's actually committed:

- **`auth.callback.tsx`**: the brief describes a `resolveHashSession` function and a best-effort `/auth/me` role-backfill block with a second `setAuth(...)` call. Neither exists in the live file. The live file only has `resolveToken` (no `resolveHashSession`) and exactly **one** `setAuth` call — the magic-link verify success handler. I converted that one call site; there was no second call site or role-backfill block to convert.
- **`auth.oauth.callback.tsx`**: matched the brief closely for the `refreshToken`/guard-clause/`setAuth` shape, but the brief's claimed "best-effort role-backfill `setAuth({...})` call further down the file" does not exist — the file ends right after the single `setAuth` call.
- **`login.tsx`**: the brief describes `handlePasswordSubmit`/`handleRegisterSubmit` making inline `api<{accessToken, refreshToken, user}>()` calls directly in this file. The live file instead has `handleLoginSuccess(session)` / `handleRegisterSuccess(email)` — thin callbacks passed to `<LoginForm>`/`<RegisterForm>` (separate, already-extracted components per this repo's "one component per file" rule). The actual `api<{accessToken, refreshToken, user}>('/auth/login', ...)` call lives in `apps/templates/client-shadcn/src/components/auth/LoginForm.tsx` (not in the brief's file list, and I did **not** touch it — see below). There is only **one** `setAuth` call in `login.tsx` (inside `handleLoginSuccess`); there is no second one in a register handler, since registration doesn't produce a session (email-confirmation flow).
- **Test files**: `apps/templates/client-shadcn/src/routes/__tests__/auth.callback.unit.test.tsx` and `login.unit.test.tsx` **do not exist anywhere in the repository** — not under that name, not under any other name, not even as a directory (`apps/templates/client-shadcn/src/routes/__tests__/` doesn't exist). This repo's actual test-file convention is `*.spec.tsx` (e.g. `components/auth/__tests__/LoginForm.spec.tsx`), not `*.unit.test.tsx`. Steps 3 and 6 are trivially satisfied — there's nothing to check, let alone change.

None of this blocked me: the concrete transformation the brief actually cares about (kill every `useAuthStore`/`.setAuth(` call site, replace with `setAccessToken` + `setUser`) is unambiguous and was verified via direct grep before and after — exactly 3 call sites existed, matching the brief's file list, and 0 remain. I proceeded rather than escalating since the core interface migration was fully resolvable from the live code; I'm flagging this so whoever executes a later task in this plan (especially anything that assumes `resolveHashSession`, a role-backfill block, or `handlePasswordSubmit`/`handleRegisterSubmit` exist) re-verifies against the live file first.

## `LoginForm.tsx` / `RegisterForm.tsx` — deliberately not touched

`LoginForm.tsx`'s `handleSubmit` still declares its `api<{accessToken: string; refreshToken: string; user: {...}}>('/auth/login', ...)` inline type with a `refreshToken: string` field, even though the backend (Task 4 of this plan) now returns `{accessToken, user}` only — so `refreshToken` will simply be `undefined` at runtime. This is now a stale/inaccurate type. I did **not** fix it because:

- It's not in the brief's file list for this task, and the brief's "Code Organization" section restricts changes to the 4 listed files plus test files.
- It causes no build/lint/runtime failure: `LoginForm`'s `onSuccess: (session: {accessToken, refreshToken, user}) => void` prop type is still structurally compatible with `login.tsx`'s narrower `handleLoginSuccess(session: {accessToken, user}) => void` (a function accepting a subset of fields is assignable where a function accepting the wider type is expected — contravariance holds here), and at runtime `handleLoginSuccess` only reads `session.accessToken`/`session.user`, never `session.refreshToken`.

This is worth a follow-up cleanup (drop `refreshToken` from `LoginForm.tsx`'s two inline type declarations) but it's out of this task's explicit scope and doesn't affect correctness or tests today.

## Full suite results

`yarn nx test client-shadcn`: **PASS** — 4 test files, 10 tests (`app.spec.tsx`, `LoginForm.spec.tsx` x4, `OfflineBanner.spec.tsx` x3, `UpdatePrompt.spec.tsx` x2).

`yarn nx test template-shared`: **PASS** — 4 test files, 11 tests (`access-token.unit.test.ts` x3, `create-api.unit.test.ts` x2, `csrf.unit.test.ts` x2, `silent-refresh.unit.test.ts` x4).

`yarn nx lint client-shadcn`: **0 errors**, 1 pre-existing warning in `main.tsx` (`no-non-null-assertion`, unrelated to this task, untouched file).

`yarn nx lint template-shared`: **0 errors, 0 warnings**.

`yarn nx run client-shadcn:vite:build` (no standalone `build` target exists for this project — confirmed via `yarn nx show project client-shadcn --json`, only `vite:build`): **PASS**, built successfully (this is the run that would have caught the `_dashboard.tsx` `accessToken` compile error had I not fixed it).

`yarn nx build template-shared`: **PASS** (`shared` dependency served from cache, `template-shared` TS compile succeeded).

## Confirmation: "no changes needed" test files actually checked, not assumed

- Confirmed via `find`/`ls` that `apps/templates/client-shadcn/src/routes/__tests__/` doesn't exist at all, and neither `auth.callback.unit.test.tsx` nor `login.unit.test.tsx` exist anywhere in the repo (checked with both exact names and a broad `*.test.tsx`/`*.spec.tsx` sweep).
- Read the one real test file that does touch the login flow, `apps/templates/client-shadcn/src/components/auth/__tests__/LoginForm.spec.tsx` — confirmed it only exercises OAuth/magic-link button visibility gating via env-var stubs (`VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK`), never touches `useAuthStore`, `setAuth`, or any token field. Untouched, still passes.

## Files changed (commit `ed47f09`)

- `libs/template-shared/src/lib/stores/auth.store.ts`
- `apps/templates/client-shadcn/src/routes/auth.callback.tsx`
- `apps/templates/client-shadcn/src/routes/auth.oauth.callback.tsx`
- `apps/templates/client-shadcn/src/routes/login.tsx`
- `apps/templates/client-shadcn/src/routes/_dashboard.tsx` (not in brief's list; required fix, see above)

Commit message: "feat(client): trim useAuthStore to user-only, rewire callback routes onto in-memory access token" (body explains the `_dashboard.tsx` fix), with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Self-review findings

- **Completeness:** re-grepped after all edits for `\.setAuth(`, `useAuthStore.*setAuth`, `getState().accessToken`, `getState().refreshToken`, `s.accessToken`, `s.refreshToken`, `state.accessToken`, `state.refreshToken` across both `apps/templates/client-shadcn/src` and `libs/template-shared/src` — zero hits. `AuthState`'s only fields are `user`/`setUser`/`logout`.
- **Quality:** each edit matches the surrounding file's existing style (same import grouping, same destructuring pattern for store selectors).
- **Discipline:** no scope creep — did not touch `LoginForm.tsx`/`RegisterForm.tsx` despite their stale `refreshToken` type field (documented above, deliberately out of scope). The one file added beyond the brief's list (`_dashboard.tsx`) was a forced, build-breaking consequence of the interface change, explicitly pre-authorized by the brief's own Step 7 language.
- **Testing:** both full suites pass, output is clean (no new warnings), builds are green.

## Concerns

1. **Brief accuracy for this plan's later tasks**: as documented above, the brief's prose for `auth.callback.tsx`/`auth.oauth.callback.tsx`/`login.tsx` described logic (`resolveHashSession`, role-backfill blocks, `handlePasswordSubmit`/`handleRegisterSubmit`) that doesn't exist in the live tree, and named test files that don't exist anywhere. If a later task in this plan (e.g. Task 11's `AuthBootstrap`) references function/file names from this task's brief, verify against the live file first rather than trusting the prose.
2. **`_dashboard.tsx` interim behavior**: its route guard now checks the in-memory `getAccessToken()` instead of the previously-persisted store value. Until Task 11 (`AuthBootstrap`, not yet implemented per the plan doc) wires `performSilentRefresh` into app boot, a hard page reload on any `/  _dashboard` route will bounce to `/login` even with a valid `icore_rt` cookie, since the in-memory token is empty on fresh page load. This is expected/by-design for this incremental migration (confirmed Task 11 exists specifically to close this gap) but flagging it so it isn't mistaken for a regression before Task 11 lands.
3. **`LoginForm.tsx`/`RegisterForm.tsx` stale `refreshToken` type field** — not a functional bug (documented above), but worth a follow-up cleanup pass since the backend no longer sends that field.
