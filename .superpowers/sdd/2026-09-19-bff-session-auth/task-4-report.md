# Task 4 Execution Report: Rewrite AuthGuard to resolve identity from the session cookie

## What was implemented

1. **`libs/shared/src/http/session-cookie.ts`** (new) — `setSessionCookie`, `clearSessionCookie`,
   `readSessionId` helpers for the `icore_sid` cookie, mirroring the existing shape of
   `auth-cookies.ts` (httpOnly, `secure` gated on `isProd`, `sameSite: 'none'|'lax'`, 30-day max age).
2. **`libs/shared/src/index.ts`** — added `export * from './http/session-cookie';`.
3. **`apps/api/src/app/auth/auth.guard.ts`** (rewritten) — `AuthGuard` now:
   - Reads `icore_sid` from the request cookie (via `readSessionId`) instead of a `Bearer` header.
   - Looks up the session in `SessionStore` (injected via the `SESSION_STORE` token from Task 3).
   - If the provider access token is stale (within `REFRESH_SKEW_MS` = 30s of expiry), acquires
     `sessionStore.withRefreshLock` and re-checks staleness after acquiring the lock (double-check,
     so a request that waited for the lock reuses the token another concurrent request just refreshed
     instead of refreshing again).
   - On refresh, distinguishes an explicit `invalid_refresh_token` rejection (deletes the session,
     401 `UnauthorizedException`) from any other failure — treated as a transient auth-service outage
     (503 `ServiceUnavailableException`, session left intact).
   - Populates `req.user = { uid, email, role }` in the same shape controllers already expect.
4. **Test files** — `libs/shared/src/http/__tests__/session-cookie.unit.test.ts` (4 tests) and
   `apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts` (6 tests, replacing the old
   Bearer-header-based test file).

## Deviation from the brief (lint-driven)

The brief's exact test code used `any` (`req: any`, `authClient as any`) in several places. This
repo's `eslint.config.mjs` sets `@typescript-eslint/no-explicit-any: 'error'` with **no test-file
override**, and the existing test files in this repo (e.g. `auth.controller.unit.test.ts`) already
follow the convention of typed mocks with `as unknown as X` instead of `any`. Since AGENTS.md's
post-coding routine requires `nx lint` to be clean, I kept the brief's logic and assertions
byte-for-byte but replaced the loose typing:
- `libs/shared/.../session-cookie.unit.test.ts`: `req: any` → `req: { cookies } as unknown as Request`.
- `apps/api/.../auth.guard.unit.test.ts`: introduced a local `MockRequest` interface
  (`{ cookies: Record<string,string>; user?: {...} }`) instead of `any` for every `req`, and
  `authClient as any` → `authClient as unknown as AuthClientService`.

No behavioral/assertion change — same test bodies, same expectations, same pass/fail semantics.

## What was tested and results

- `yarn nx test shared -- session-cookie` → **PASS, 4/4 tests**.
- `yarn nx test api -- auth.guard` → **PASS, 6/6 tests**.
- Full `yarn nx test shared` → **PASS, 94/94 tests** (14 files).
- Full `yarn nx test api` → **PASS, 59/59 tests** (9 files).
- `yarn nx lint shared` → clean (0 errors; 2 pre-existing warnings in unrelated files:
  `strategies/__tests__/auth.contract.unit.test.ts`, `strategies/fakes/fake-db.ts` — untouched by
  this task).
- `yarn nx lint api` → clean, 0 errors/warnings.
- `yarn nx build shared` → success.
- `yarn nx build api` → success (webpack compiled successfully, all client-lib deps built).
- `npx prettier --check` on all 5 touched files → clean.

## TDD Evidence

### Cookie helpers

**RED** — `yarn nx test shared -- session-cookie` (before `session-cookie.ts` existed):
```
FAIL  shared  src/http/__tests__/session-cookie.unit.test.ts [ src/http/__tests__/session-cookie.unit.test.ts ]
Error: Cannot find module '../session-cookie' imported from
  /home/vladimir-tkach/Projects/22/libs/shared/src/http/__tests__/session-cookie.unit.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN** — after writing `session-cookie.ts` + `index.ts` export:
```
✓ shared  src/http/__tests__/session-cookie.unit.test.ts (4 tests) 6ms
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### AuthGuard

**RED** — `yarn nx test api -- auth.guard` (against the old Bearer-token guard, new cookie-based
test file written first):
```
FAIL api  src/app/auth/__tests__/auth.guard.unit.test.ts > AuthGuard > rejects a request with no session cookie
AssertionError: expected TypeError: Cannot read properties of unde… to be an instance of UnauthorizedException
 ❯ AuthGuard.canActivate src/app/auth/auth.guard.ts:28:32
   const header = req.headers.authorization ?? '';
...
 Test Files  1 failed | 8 passed (9)
      Tests  6 failed | 53 passed (59)
```
(all 6 new AuthGuard tests failed; the other 8 pre-existing test files in `api` were unaffected)

**GREEN** — after rewriting `auth.guard.ts`:
```
✓ api  src/app/auth/__tests__/auth.guard.unit.test.ts (6 tests) 8ms
 Test Files  9 passed (9)
      Tests  59 passed (59)
```

## Files changed

- `apps/api/src/app/auth/auth.guard.ts` (rewritten)
- `apps/api/src/app/auth/__tests__/auth.guard.unit.test.ts` (rewritten)
- `libs/shared/src/http/session-cookie.ts` (new)
- `libs/shared/src/http/__tests__/session-cookie.unit.test.ts` (new)
- `libs/shared/src/index.ts` (added export)

## Self-review findings

- **401 vs 503 distinction**: verified via two dedicated tests — `invalid_refresh_token` message
  → `UnauthorizedException` + session deleted; any other error message (e.g. `connect ECONNREFUSED`)
  → `ServiceUnavailableException` + session left intact. Both pass.
- **Single-flight concurrency**: the test fires two concurrent `canActivate` calls against the same
  stale session and asserts `authClient.refresh` was called **exactly once** (not just that both
  calls succeeded) — this is a real behavioral proof, backed by `FakeSessionStore.withRefreshLock`'s
  queue-and-retry implementation plus the guard's own double-check-after-lock-acquisition logic (the
  second waiter re-reads the session inside the lock and finds it already fresh, so it returns early
  without calling `refreshSession` a second time).
- **Quality**: rewrite follows the existing guard's structure/conventions (same `@Injectable`/
  `CanActivate` shape, same `IS_PUBLIC_KEY` short-circuit at the top). No leftover Bearer-token code.
- **YAGNI**: implemented only what the brief specified — no extra helpers, no speculative
  generalization of the cookie options beyond what `session-cookie.ts` needed.
- **Test output pristine**: the only console noise during `nx test api` is a pre-existing `WARN`
  log from `auth.controller.unit.test.ts` (unrelated to this task, present before this change too).

## Issues or concerns

None. The only departure from the brief's literal text is the `any` → typed-mock substitution in
tests, documented above, made necessary by this repo's strict lint config and required by the
mandatory post-coding lint gate.
