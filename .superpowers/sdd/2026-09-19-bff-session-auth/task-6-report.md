# Task 6 Execution Report — Global `CsrfGuard`, every mutating route

## What I implemented

- Created `apps/api/src/app/http/csrf.guard.ts`: `CsrfGuard implements CanActivate`, exactly per
  the brief's Step 1. Safe methods (`GET`/`HEAD`/`OPTIONS`) bypass. `/api/auth/*` routes bypass
  (verified the global prefix is `api` via `apps/api/src/main.ts`'s `app.setGlobalPrefix('api')`
  and that `AuthController` is `@Controller('auth')`, so `/api/auth/` is the correct real-world
  prefix, not just a brief assumption). Everything else calls `verifyCsrf(req)` from `@icore/shared`
  and throws `ForbiddenException('csrf_mismatch')` on failure.
- Created `apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts` verbatim per the brief's Step 2
  (6 tests: GET bypass, auth-route bypass, missing-token reject, mismatched-token reject,
  matching-token POST accept, matching-token DELETE accept).
- **Step 4 correction applied as instructed:** registered `CsrfGuard` in
  `apps/api/src/app/auth/auth.module.ts`'s existing `providers: [APP_GUARD...]` array, immediately
  after the existing `{ provide: APP_GUARD, useClass: AuthGuard }` entry, importing `CsrfGuard`
  from `'../http/csrf.guard'`. Did **not** touch `apps/api/src/app/app.module.ts` — read it first
  and confirmed it has zero `APP_GUARD` registrations, consistent with the correction. The full
  provider array in `auth.module.ts` is now:
  ```ts
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_GUARD, useClass: CsrfGuard },
  ```

## Tests run

- `yarn nx test api --testPathPattern=csrf.guard` → the nx vitest executor doesn't actually filter
  by the pattern (runs the whole `api` vitest project regardless), so this ran the full suite:
  **10 test files, 64 tests, all PASS**, including the new `csrf.guard.unit.test.ts` (6/6).
- `yarn nx test api --skip-nx-cache` (explicit full-suite re-run, uncached) → same result, **10
  test files, 64 tests, all PASS**.
- `yarn nx lint api` → clean, 0 errors.
- `yarn nx build api` → webpack compiled successfully.

## Step 5 investigation: did wiring the guard globally break anything?

**What I checked:**
1. Grepped `apps/api/src` for every existing test file and read the four most relevant ones
   (`notes.controller.unit.test.ts`, `payment.controller.unit.test.ts`, `ai.controller.unit.test.ts`,
   `auth.controller.unit.test.ts`, `assert-ownership.unit.test.ts`, plus the guard tests). All of
   them instantiate the controller/guard class directly (e.g. `new NotesController(client, abilities)`,
   `new AuthGuard(...)`) and call methods on it directly — none go through Nest's HTTP pipeline
   (no `Test.createTestingModule(...).compile()` + `app.init()`, no `supertest`/`request(app)`).
   Confirmed with `grep -rn "supertest\|request(app\|Test.createTestingModule\|app.init()" apps/api/src`
   → zero hits. Guards are only invoked by Nest's request pipeline, so none of these tests ever
   exercise `CsrfGuard` (or `AuthGuard`, or `ThrottlerGuard`) at all — they were already bypassing
   guards before this task, and still do.
2. Checked for e2e-style tests that would hit the gateway over real HTTP: `apps/api-e2e/` exists
   but contains only `src/support/{global-setup,global-teardown,test-setup}.ts` — no actual spec
   files, nothing that sends a request to any of the 10 mutating routes. `apps/client/e2e/` does
   not exist in this repo (only `apps/templates/client-*/e2e` for the generator's scaffolded output
   template, which is out of scope — it's a build artifact, not this repo's own tests).
3. Ran the full `api` suite before and after wiring the guard (effectively — the "before" state is
   what Step 3's isolated guard-test run would have looked like, and I additionally reasoned from
   the grep evidence above rather than needing a literal before/after diff, since no test in the
   suite touches the HTTP pipeline).

**Result: nothing broke.** 64/64 tests pass both in the targeted run and the full uncached run.
No test needed a `X-CSRF-Token` header or `icore_csrf` cookie mock added, because no test in this
repo currently drives requests through the actual Nest guard pipeline for the mutating routes in
question. This is a coverage gap worth flagging (see Concerns below) but is out of this task's
scope per the brief and the "don't turn Step 5 into an unplanned rewrite" escalation guidance.

## Files changed

- `apps/api/src/app/http/csrf.guard.ts` (new)
- `apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts` (new)
- `apps/api/src/app/auth/auth.module.ts` (modified — added `CsrfGuard` import + `APP_GUARD` entry)

`apps/api/src/app/app.module.ts` was deliberately **not** touched, per the Step 4 correction.

## Self-review findings

- **Completeness:** Guard + tests implemented verbatim per brief Steps 1–3; Step 4 correction
  applied exactly as instructed (`auth.module.ts`, not `app.module.ts`); Step 5 investigated with
  concrete evidence rather than assumed.
- **Quality:** Matches existing NestJS guard conventions in this repo (`AuthGuard`, `AbilityGuard`
  follow the same `CanActivate`/`ExecutionContext`/`ForbiddenException` shape). No new deps.
- **Discipline:** Implemented exactly what the (corrected) brief specified — no extra refactoring,
  no touching unrelated files.
- **Testing:** The 6 tests verify real behavior: safe-method bypass, auth-route bypass, missing
  token rejection, mismatched token rejection, matching token acceptance on both POST and DELETE
  (not just POST). Test output is pristine — no console noise from the new test file (the WARN
  lines in the full-suite output come from the pre-existing `auth.controller.unit.test.ts` logout
  tests, unrelated to this task).

## Concerns

- **Coverage gap (pre-existing, not introduced by this task):** No test in this repo currently
  exercises the real Nest guard pipeline for any route (no supertest/`app.init()`-based test
  exists for `api` or `api-e2e`). This means `CsrfGuard`, `AuthGuard`, and `ThrottlerGuard` are
  each unit-tested in isolation but never verified end-to-end wired together on a live route. This
  is a real gap but predates this task (the same was true before `CsrfGuard` existed) and fixing it
  would mean building out `api-e2e`'s test suite from scratch — a large, unplanned addition outside
  this task's scope. Flagging per the "ask when Step 5 threatens to become an unplanned rewrite"
  guidance rather than silently expanding scope.
- No other concerns. `yarn nx test api`, `yarn nx lint api`, and `yarn nx build api` are all green;
  `npx prettier --check` is clean on all three touched files.

---

## Fix round 1 — CSRF hole on the Task 7 admin revoke-user route (blanket auth-prefix bypass)

**Finding (surfaced by the coordinator after this task's initial review, from a later task):**
Task 7 added `POST /auth/admin/revoke-user/:uid` — an authenticated, cookie-driven, mutating admin
route. `CsrfGuard`'s original `if (req.path.startsWith('/api/auth/')) return true;` blanket bypass
exempted this route (and any future `/api/auth/*` route) from CSRF protection entirely: a
malicious page could trigger a cross-site `POST` to it using only an ambient `icore_sid` cookie,
no CSRF token required. Not a fault of this task at the time (the admin route didn't exist yet
when Task 6 was written/reviewed), but a live, real CSRF hole once Task 7 landed on top of it.

**Fix applied to `apps/api/src/app/http/csrf.guard.ts`:** Replaced the blanket prefix bypass with
an explicit allowlist, structured as:
- `PUBLIC_AUTH_EXACT_PATHS` (a `Set`): `/api/auth/login`, `/api/auth/register`,
  `/api/auth/logout`, `/api/auth/session/adopt` — routes that either issue the CSRF cookie itself
  (login/register/session-adopt) or where forging has no security consequence beyond availability
  (logout).
- `PUBLIC_AUTH_PATH_PREFIXES` (an array): `/api/auth/magic-link` (covers both the request route
  and its `/verify` sibling) and `/api/auth/oauth/` (covers both `/:provider` and
  `/:provider/callback`).
- `isPublicAuthPath(path)` checks the exact-match set first, then the prefix array.

`canActivate` now calls `isPublicAuthPath(req.path)` instead of the old blanket
`startsWith('/api/auth/')`. `/api/auth/admin/revoke-user/:uid` matches neither the exact set nor
either prefix, so it now falls through to the normal `verifyCsrf(req)` check like any other
mutating route. `GET /api/auth/session` was already safe via the `SAFE_METHODS` bypass and
doesn't need — and doesn't get — an entry in either list (confirmed it doesn't accidentally match
the `/api/auth/session/adopt` exact-match entry, since exact-match requires full equality, not a
prefix).

**Tests added to `csrf.guard.unit.test.ts`:**
- `rejects the admin revoke-user route with no CSRF cookie/header` — `POST
  /api/auth/admin/revoke-user/some-uid` with no token now throws `ForbiddenException` (the whole
  point of the fix).
- `allows the admin revoke-user route with a matching CSRF cookie/header pair` — same route
  succeeds once a valid token is supplied, proving it's now treated like any other mutating route
  rather than silently blocked forever.
- `allows the oauth start route without a CSRF token` — `POST /api/auth/oauth/google`.
- `allows the oauth callback route without a CSRF token` — `POST
  /api/auth/oauth/google/callback`.
- `allows the magic-link verify route without a CSRF token` — `POST
  /api/auth/magic-link/verify`.
- (Existing `allows auth routes without a CSRF token` test for `POST /api/auth/login` continues
  to pass unchanged, confirming no regression on the original bypass routes.)

Used `POST` (not the routes' real `GET` method, for the two oauth routes) deliberately for the
oauth test cases, to isolate and actually exercise the path-prefix-matching branch of the guard
rather than trivially passing via the `SAFE_METHODS` bypass — the real oauth routes are `GET`, so
in production they'd already bypass via `SAFE_METHODS` regardless of the allowlist, but the test
needs a mutating method to prove the path-matching logic itself is correct.

**Verification:**
- `yarn nx test api --testPathPattern=csrf.guard --skip-nx-cache` → whole `api` suite runs (as
  before, the pattern flag doesn't filter under this nx/vitest setup): **10 test files, 70 tests,
  all PASS** (up from 64 — 6 new tests added: 5 new + 1 pre-existing renamed/kept; `auth.controller
  .unit.test.ts` also grew from 18→19 tests independently, from Task 7's own admin-route test,
  unrelated to this fix).
- `yarn nx test api --skip-nx-cache` (explicit full-suite re-run) → same, **10 test files, 70
  tests, all PASS**.
- `yarn nx lint api` → clean, 0 errors.
- `yarn nx build api` → webpack compiled successfully.
- `npx prettier --write` then `--check` on both touched files → clean (prettier collapsed one
  test's multi-line `expect(...).toBe(true)` onto a single line — cosmetic only).
- Confirmed no template drift: `git status --short -- tools/create-icore/templates` → empty.

**Files changed (this fix round):**
- `apps/api/src/app/http/csrf.guard.ts`
- `apps/api/src/app/http/__tests__/csrf.guard.unit.test.ts`

**Commit:** `a818bcf` — `fix(api): narrow CsrfGuard's auth-route bypass to an explicit allowlist,
closing a CSRF hole on the admin revoke-user route`

**Concerns:** None new. The pre-existing coverage-gap concern from the initial task report (no
end-to-end guard-pipeline test anywhere in this repo) still stands and is unchanged by this fix —
the new admin-route tests are unit tests against the guard class directly, same pattern as the
rest of the file, not a full-pipeline test. Any future auth route added under `/api/auth/*` will,
by design, now require a CSRF token unless explicitly added to the allowlist — this is the
intended fail-closed behavior the fix establishes, and is worth calling out to whoever reviews
future auth routes so they don't reflexively "fix" a CSRF rejection by re-widening the bypass.
