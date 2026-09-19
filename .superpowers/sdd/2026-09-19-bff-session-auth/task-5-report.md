# Task 5 Execution Report — Rewrite AuthController for the session-cookie model

## What I implemented

- Rewrote `apps/api/src/app/auth/auth.controller.ts` per the brief's full replacement:
  - `register`/`login`/`verifyMagicLink`/`session/adopt` all delegate to a new private
    `startSession(session, res, role?)` helper that calls `sessionStore.create(...)`,
    `setSessionCookie(res, sessionId, isProd)`, sets `icore_csrf` via `generateCsrfToken()`,
    and returns `{ user }` only.
  - `oauthCallback` uses an equivalent `startSessionRedirect` helper (redirect-based, no
    tokens in the URL fragment) that lands on `${CLIENT_ORIGIN}/dashboard`.
  - Added `GET /auth/session` (`getSession`) that reads `req.user` (populated by `AuthGuard`)
    and returns `{ user }` or 401.
  - `logout` now reads `icore_sid` via `readSessionId`, deletes the `SessionStore` record
    *before* best-effort provider revoke (same ordering rationale as before, just applied to
    the session store instead of the refresh cookie), then clears both `icore_sid` and
    `icore_csrf` cookies.
  - `session/adopt` keeps the exact token-substitution defense: `verify()` and `refresh()`
    are independent calls; only `refreshed.user.id === verified.uid` is accepted, and only
    then does it call `startSession` with the rotated pair + `verified.role`.
  - The old `/auth/refresh` route is gone entirely (refreshing is now `AuthGuard`'s job, per
    Task 4).
  - Constructor now injects `@Inject(SESSION_STORE) private readonly sessionStore: SessionStore`
    alongside the existing `AuthClientService`/`ConfigService`.

- Deleted the dead `setAuthCookies`, `clearAuthCookies`, `readRefreshToken` exports and their
  private `REFRESH_COOKIE`/`REFRESH_COOKIE_PATH`/`REFRESH_COOKIE_MAX_AGE_MS` consts and the
  `cookieOptions` helper from `libs/shared/src/http/auth-cookies.ts`. Kept `verifyCsrf`,
  `generateCsrfToken`, and the `CSRF_COOKIE` const (still used internally by `verifyCsrf`).

- Rewrote `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts` and
  `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts` (see below).

## Two deliberate deviations from the brief's literal code (both lint-driven)

1. The brief's import block for `auth.controller.ts` includes `verifyCsrf` from `@icore/shared`,
   but the rewritten controller body never calls it (the brief's own trailing note confirms
   `verifyCsrf` usage moves entirely to Task 6's `CsrfGuard`, not this controller). Importing it
   unused trips `@typescript-eslint/no-unused-vars` (`error` in this repo's `eslint.config.mjs`).
   I dropped it from the import list.
2. The pre-existing controller had an unused `ForbiddenException` import left over from the old
   `/auth/refresh` CSRF check (that route no longer exists). `nx lint api` caught it as an
   unused-import error; removed it.
3. The additional-requirement text says to keep both `CSRF_COOKIE` **and** `CSRF_COOKIE_PATH`
   consts in `auth-cookies.ts`. `CSRF_COOKIE_PATH` was referenced only inside the now-deleted
   `setAuthCookies`/`clearAuthCookies` (via the `cookieOptions` helper) — with those gone it has
   zero remaining references and would itself trip `no-unused-vars`. I dropped `CSRF_COOKIE_PATH`
   (and `cookieOptions`) along with the two functions; kept `CSRF_COOKIE` (still used by
   `verifyCsrf`). Grep confirms `CSRF_COOKIE_PATH` has no other repo-wide callers either.

None of these change behavior — they're straight unused-import/const removals required to keep
`nx lint` green, consistent with AGENTS.md's "Clean Code: actively remove unused imports" rule.

## Test file rewrite

Preserved every scenario from the original file, translated to the session-cookie model with a
`FakeSessionStore` (no more raw cookie-value assertions against `icore_rt`):

- **magic-link**: `requestMagicLink` origin-building (2 tests, unchanged), `verifyMagicLink`
  (creates a session, sets `icore_sid`/`icore_csrf`, returns `{ user }` only), plus added
  `login`/`register` equivalents (previously covered together in one describe block; kept as
  separate `it`s here to match the brief's excerpt for `login`).
- **session/adopt**: success path (verifies + cross-checks + adopts rotated pair + `verified.role`),
  verify-failure 401 (no session created), refresh-failure 401 (no session created), and the
  full token-substitution defense test (attacker/victim uid mismatch) — all four original
  scenarios preserved, assertions updated to "no `icore_sid`/`icore_csrf` cookie set" instead of
  "no `icore_rt`/`icore_csrf` cookie set".
- **session** (new route, not in the original file): two small tests for `getSession` — returns
  `{ user }` from `req.user`, throws 401 when `AuthGuard` didn't populate it. Added for coverage
  of the one genuinely new route; kept minimal per YAGNI.
- **logout**: deletes the session record before revoking (asserts `sessionStore.get` returns
  `null` afterward and both cookies were cleared), idempotent with no session cookie, and still
  deletes + clears cookies when the provider revoke rejects (transport failure) — all three
  original scenarios preserved.
- **OAuth**: `oauthStart` sets state cookie + redirects (unchanged), `oauthCallback` rejects on
  state mismatch (unchanged), `oauthCallback` success now asserts a session was created and the
  redirect lands on `${CLIENT_ORIGIN}/dashboard` with no tokens in the URL (replacing the old
  fragment-based assertions), `oauthStart` rejects unknown providers (unchanged).
- Dropped the old **refresh** describe block entirely — that route no longer exists.

`libs/shared/src/http/__tests__/auth-cookies.unit.test.ts` trimmed to just the surviving
`verifyCsrf`/`generateCsrfToken` describe blocks (the `setAuthCookies`/`clearAuthCookies`/
`readRefreshToken` blocks were deleted along with the functions they tested — this file lives in
`libs/shared`, part of the `nx test shared` gate, so it had to compile against the trimmed
`auth-cookies.ts`).

## Dead-code grep check (before deletion)

```
$ grep -rn "setAuthCookies\|clearAuthCookies\|readRefreshToken" --include="*.ts" . --exclude-dir=dist --exclude-dir=node_modules
apps/api/src/app/auth/auth.controller.ts:20:  setAuthCookies,
apps/api/src/app/auth/auth.controller.ts:22:  readRefreshToken,
apps/api/src/app/auth/auth.controller.ts:24:  clearAuthCookies,
apps/api/src/app/auth/auth.controller.ts:70,93,101,106,118,130,166,220,268   (call sites, all being replaced this task)
libs/shared/src/http/auth-cookies.ts:26,46,51   (the definitions themselves)
libs/shared/src/http/__tests__/auth-cookies.unit.test.ts:4-6,15-113   (tests of the definitions, rewritten this task)
tools/create-icore/templates/apps/api/src/app/auth/auth.controller.ts   (generated scaffold copy — build artifact, out of scope)
tools/create-icore/templates/libs/shared/src/http/auth-cookies.ts       (same)
tools/create-icore/templates/libs/shared/src/http/__tests__/auth-cookies.unit.test.ts (same)
```

Every non-templates hit is a file this task touches. `tools/create-icore/templates/**` is a
generated build artifact (per repo convention — regenerated from source, not hand-edited) and was
explicitly out of this task's file list; I left it untouched and confirmed at the end (`git
status --porcelain`) that no template drift appeared as a side effect of running tests/builds.

After the deletion, re-running the same grep against only the real source
(`apps/api/src/app/auth/auth.controller.ts`, `libs/shared/src/http/auth-cookies.ts`, and its test)
returns zero hits.

## Tests run

- `yarn nx test api --testPathPattern=auth.controller` → **9 test files, 58 tests, all PASS**
  (the pattern still runs the whole `api` vitest project; the `auth.controller.unit.test.ts`
  file itself contributed 18 of those, all passing).
- `yarn nx test shared` → **14 test files, 88 tests, all PASS** (confirms the `auth-cookies.ts`
  deletion didn't break the `RedisSessionStore`/`FakeSessionStore` contract tests or anything
  else in `shared`).
- `yarn nx lint api` → clean after removing the two unused imports noted above.
- `yarn nx lint shared` → clean (0 errors; 2 pre-existing unrelated warnings in other files).
- `yarn nx build api` → webpack compiled successfully.
- `yarn nx build shared` → tsc compiled successfully.
- `npx prettier --check <touched files>` → all clean (ran `--write` first).

## Files changed

- `apps/api/src/app/auth/auth.controller.ts`
- `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`
- `libs/shared/src/http/auth-cookies.ts`
- `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`

## Self-review findings

- Completeness: every old route has a session-cookie equivalent; new `GET /auth/session` route
  added and tested; token-substitution defense in `session/adopt` intact (independent
  `verify()`/`refresh()` calls, cross-checked via `refreshed.user.id !== verified.uid`); dead
  auth-cookies.ts exports removed, zero remaining callers confirmed via grep (excluding the
  generated `tools/create-icore/templates/` copy, out of scope).
- Quality: matches existing NestJS controller conventions (Swagger decorators, `@Public()`,
  throttle, private helpers for shared cookie-setting logic).
- Discipline: only the brief's changes plus the ruled-on auth-cookies.ts cleanup, plus two
  necessarily-related unused-import removals (`verifyCsrf` from the controller's own import list,
  `ForbiddenException` left over from the deleted `/auth/refresh` route) and one necessarily-
  related unused-const removal (`CSRF_COOKIE_PATH`/`cookieOptions` in `auth-cookies.ts`) — all
  three were required to keep `nx lint` at 0 errors, not scope creep.
- Testing: rewritten test file preserves every original scenario (magic-link, login, register,
  session/adopt incl. token-substitution, logout incl. revoke-failure, OAuth start/callback incl.
  unknown-provider and state-mismatch), asserts real behavior (`FakeSessionStore.get()` returns
  `null` after logout, cookies actually present/absent) rather than mocks echoing themselves, plus
  new minimal coverage for the new `getSession` route.

## Issues or concerns

None. Both `api` and `shared` test suites, lints, and builds are green; the branch is on
`feature/bff-session-auth` as expected; only the 4 in-scope files were staged and committed
(`docs/live-testing-supabase-accounts.md`, pre-existing untracked from before this task, was left
alone).

---

## Fix round 1 — icore_csrf missing maxAge (Important finding from task review)

**Finding:** In `startSession` and `startSessionRedirect`, `res.cookie(CSRF_COOKIE, csrfToken, {...})`
was set without a `maxAge`, making it a browser-session-only cookie, while `icore_sid` (via
`setSessionCookie` in `libs/shared/src/http/session-cookie.ts`) persists 30 days
(`SESSION_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000`). A user who closed and reopened their
browser would keep a valid `icore_sid` but lose `icore_csrf`, so every CSRF-protected mutating
request would fail once Task 6's global `CsrfGuard` lands, despite an otherwise-valid session —
with no route that refreshes just the CSRF cookie short of a fresh login.

**Fix applied:** Added `maxAge: 30 * 24 * 60 * 60 * 1000` to both `res.cookie(CSRF_COOKIE, ...)`
calls (in `startSession` and `startSessionRedirect`), each with a short comment noting it must
match `icore_sid`'s lifetime. Checked first whether `SESSION_COOKIE_MAX_AGE_MS` is exported from
`session-cookie.ts` — it is a private (non-exported) const — so per the reviewer's guidance I used
the literal with a comment rather than adding a new export just for this one-line fix (avoiding
scope creep).

**Verification:**
- `npx prettier --write` / `--check apps/api/src/app/auth/auth.controller.ts` → clean (no diff
  from `--write`, `--check` passes).
- `yarn nx test api --testPathPattern=auth.controller` → 9 test files, **58/58 tests pass**
  (18 in `auth.controller.unit.test.ts`).
- `yarn nx lint api` → clean, 0 errors.

**Commit:** `45c6f58` — `fix(auth): give icore_csrf cookie the same 30-day maxAge as icore_sid`

**Deferred (per coordinator instruction, not fixed in this round):** 3 Minor findings — duplicated
`CSRF_COOKIE` magic string, near-duplicate `startSession`/`startSessionRedirect` helpers, no error
handling around `sessionStore.get`/`delete` in `logout` — left for the ledger.
