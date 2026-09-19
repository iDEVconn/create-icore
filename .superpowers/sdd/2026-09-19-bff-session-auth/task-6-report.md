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
