# Task 2: Fix icore_csrf cookie path — report

## What changed and why

`libs/shared/src/http/auth-cookies.ts` previously had a single `COOKIE_PATH = '/api/auth'`
constant applied via `cookieOptions(isProd, httpOnly)` to BOTH `icore_rt` (httpOnly refresh
token) and `icore_csrf` (non-httpOnly, meant to be read by client JS via `document.cookie`).

Per RFC 6265, `document.cookie` only exposes a cookie on pages whose path is a prefix of (or
equal to) the cookie's `Path` attribute. Since the SPA's real routes (`/`, `/login`,
`/dashboard`, ...) are never under `/api/auth`, `readCsrfCookie()` always returned `null` from
actual app pages, the `X-CSRF-Token` header was never attached to `/auth/refresh` calls,
`verifyCsrf` always failed server-side, and `POST /auth/refresh` always returned 403. This was
confirmed live: login succeeded, `localStorage` correctly held only `{user}`, but reloading
`/dashboard` produced a 403 on refresh and a redirect to `/login` — no authenticated user could
survive a page reload.

### Fix

- Split the single `COOKIE_PATH` constant into two: `REFRESH_COOKIE_PATH = '/api/auth'` (used
  only for `icore_rt`) and `CSRF_COOKIE_PATH = '/'` (used only for `icore_csrf`), each with a
  comment explaining why.
- `cookieOptions(isProd, httpOnly, path)` now takes `path` as an explicit third parameter
  instead of hardcoding it — `httpOnly`/`secure`/`sameSite`/`maxAge` branching is unchanged.
- `setAuthCookies` passes `REFRESH_COOKIE_PATH` for `icore_rt` and `CSRF_COOKIE_PATH` for
  `icore_csrf`.
- `clearAuthCookies` mirrors the same per-cookie paths, so `res.clearCookie` actually removes
  each cookie (Express requires a matching path for `clearCookie` to work — a mismatched path
  just sets a useless phantom cookie instead of clearing the original).
- Server-side `readRefreshToken`/`verifyCsrf` (both read from `req.cookies`, populated by
  `cookie-parser` from whatever the browser attached) are untouched — `Path` only gates
  browser-side send/read behavior, not server-side parsing. A request to `/api/auth/refresh`
  still gets both cookies attached by the browser (`icore_rt` because `/api/auth` matches,
  `icore_csrf` because `/` always matches).

## Files changed

- `libs/shared/src/http/auth-cookies.ts`
- `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts`

No other files touched.

## Test evidence

### Focused test: `yarn nx test shared -t "auth-cookies"`

The `-t` filter matched by file path too, so it ran the full `shared` suite (11 files / 78
tests), including `src/http/__tests__/auth-cookies.unit.test.ts (10 tests)` — all passed.

```
✓ shared src/__tests__/cross-boundary.unit.test.ts (2 tests) 4ms
✓ shared src/http/__tests__/auth-cookies.unit.test.ts (10 tests) 11ms
✓ shared src/abilities/__tests__/ability.unit.test.ts (9 tests) 11ms
✓ shared src/strategies/__tests__/provide-strategy.unit.test.ts (4 tests) 15ms
✓ shared src/__tests__/bootstrap.unit.test.ts (3 tests) 18ms
✓ shared src/__tests__/jobs.unit.test.ts (2 tests) 5ms
✓ shared src/security/__tests__/hmac.unit.test.ts (4 tests) 9ms
✓ shared src/__tests__/transport.unit.test.ts (9 tests) 10ms
✓ shared src/strategies/__tests__/fake-db.contract.unit.test.ts (12 tests) 10ms
✓ shared src/strategies/__tests__/fake-auth.contract.unit.test.ts (16 tests) 11ms
✓ shared src/strategies/__tests__/fake-storage.contract.unit.test.ts (7 tests) 7ms

Test Files  11 passed (11)
     Tests  78 passed (78)
```

### Full `shared` suite

Same run as above — 11 files / 78 tests passed (this command doubles as both the focused
check and the full-suite regression check since the `-t` filter didn't narrow to a single
file).

### Full `api` suite: `yarn nx test api`

```
✓ api src/__tests__/should-enable-swagger.unit.test.ts (4 tests) 7ms
✓ api src/app/storage/__tests__/assert-ownership.unit.test.ts (4 tests) 6ms
✓ api src/app/admin/__tests__/bull-board-auth.middleware.unit.test.ts (5 tests) 6ms
✓ api src/app/auth/__tests__/auth.guard.unit.test.ts (5 tests) 7ms
✓ api src/app/abilities/__tests__/ability.guard.unit.test.ts (4 tests) 14ms
✓ api src/app/payment/__tests__/payment.controller.unit.test.ts (4 tests) 5ms
✓ api src/app/ai/__tests__/ai.controller.unit.test.ts (4 tests) 7ms
✓ api src/app/notes/__tests__/notes.controller.unit.test.ts (9 tests) 11ms
✓ api src/app/auth/__tests__/auth.controller.unit.test.ts (14 tests) 12ms

Test Files  9 passed (9)
     Tests  53 passed (53)
```

`auth.controller.unit.test.ts` asserts on `res.cookies[...]` values, not paths — unaffected by
this change, as expected.

### Lint: `yarn nx lint shared`

```
2 problems (0 errors, 2 warnings)
```

Both warnings (`no-non-null-assertion` in `auth.contract.unit.test.ts:158` and
`fake-db.ts:49`) are pre-existing and unrelated to this change — confirmed by `git diff`
scope (only `auth-cookies.ts` and its test file changed).

### Build: `yarn nx build shared` (forced with `--skip-nx-cache` to confirm, since a plain

run cache-hit)

```
Compiling TypeScript files for project "shared"...
Done compiling TypeScript files for project "shared".
Successfully ran target build for project shared
```

Green, no errors.

### Formatting: `npx prettier --write` on both touched files

`auth-cookies.ts` was reformatted (the `res.cookie(REFRESH_COOKIE, ...)` call wrapped across
multiple lines since it exceeded the line-length limit with the new third argument); the test
file was already formatted correctly (`unchanged`).

## Self-review

- **Completeness:** Both `setAuthCookies` and `clearAuthCookies` updated consistently with the
  same per-cookie path constants — no risk of a clear-path mismatch silently failing to clear
  `icore_csrf` on logout.
- **Quality:** `cookieOptions` signature change is minimal and explicit (`path` as a required
  third param, no defaulting that could silently reintroduce the bug). Comments added at each
  path constant explain the RFC 6265 constraint and why the two cookies differ, so this can't
  regress silently again.
- **Discipline:** Only `libs/shared/src/http/auth-cookies.ts` and its test file changed — `git
diff` confirms no scope creep. No other files touched, no unrelated cleanup.
- **Testing:** Both test assertions for `icore_csrf` (in `setAuthCookies` and
  `clearAuthCookies` describe blocks) were changed from `path: '/api/auth'` to `path: '/'`;
  `icore_rt` assertions were left at `path: '/api/auth'`. Verified these are genuine
  assertions on the new/correct values (not just loosened to pass by accident) by reading the
  diff. Full `shared` and `api` suites pass; output is clean (no new warnings, no skipped
  tests).
- Did not touch `apps/microservices/auth/.env` or `apps/api/.env`, did not kill or restart any
  of the running dev servers, did not switch branches.

## Concerns

None. The change is narrowly scoped, the root cause (RFC 6265 Path-scoping) is well understood
and directly addressed, server-side cookie parsing is unaffected, and both cookie-clearing and
cookie-setting paths were kept consistent. Live re-verification against the running dev servers
is still pending from the requester, as instructed.
