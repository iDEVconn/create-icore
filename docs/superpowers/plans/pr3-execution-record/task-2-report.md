# Task 2 Report: Session revocation (revoke / logout)

Status: DONE
Commit: `65299fe` — `feat(auth): add session revoke (logout), close missing-revocation gap`
(preceding commit on branch, already merged/present: `468de22` — Task 1 HMAC guard, not touched here)

## What was done

Followed the brief (`.superpowers/sdd/task-2-brief.md`) step by step:

1. **Contract tests first.** Added the 3 brief-specified test cases to
   `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts` inside
   `runAuthContract()`, right after "used refresh token is rejected after rotation".
2. Ran `npx nx test shared -- auth.contract.unit.test.ts` to confirm the failing state.
3. Added `revoke(refreshToken: string): Promise<void>` to the `AuthStrategy` interface
   (`libs/shared/src/strategies/auth.ts`) with the exact JSDoc from the brief.
4. Implemented `revoke()` in:
   - `FakeAuthStrategy` (`libs/shared/src/strategies/fakes/fake-auth.ts`) — deletes from `refreshToUid`.
   - `PostgresAuthStrategy` (`libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`) —
     `DELETE FROM _icore_sessions WHERE refresh_token = ...`.
   - The postgres test double (`libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts`) —
     deletes from the in-memory `sessions` map.
   - `MongoDbAuthStrategy` (`libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts`) —
     `sessionModel.deleteOne({ refreshToken })`.
   - `SupabaseAuthStrategy` and `FirebaseAuthStrategy` — both throw `not_implemented` with the
     exact documented reasoning from the brief (scope decision: their SDKs don't map cleanly onto
     "delete a row keyed by refresh-token string").
5. Ran `npx nx run-many -t test -p shared auth-postgres` — both green (68 + 19 tests).
6. Wired the MS message pattern `auth.revoke` on `apps/microservices/auth/src/app/auth.controller.ts`.
7. Wired `AuthClientService.revoke()` in `libs/auth-client/src/lib/auth-client.service.ts`
   (placed directly after `refresh()`, before `setRole()`, matching the brief's stated location —
   my first pass had put it after `setRole()`, corrected before running further tests).
8. Wired `POST /auth/logout` on `apps/api/src/app/auth/auth.controller.ts` (public route, delegates
   to `authClient.revoke()`), placed between `refresh()` and `requestMagicLink()` per the brief.
9. Added the controller-level regression test to
   `apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts`.
10. Ran the full affected suite, fixed a real regression the brief's Step 9 didn't anticipate (see
    Deviations below), then re-ran everything green.
11. `npx prettier --write` on all touched files (no-op, everything already formatted).
12. `npx nx run-many -t lint -p shared auth auth-client auth-postgres api auth-mongodb auth-supabase auth-firebase`
    — 0 errors (2 pre-existing, unrelated `no-non-null-assertion` warnings in code this task didn't
    author: `fake-db.ts:49` and an OAuth helper line in `auth.contract.unit.test.ts` that predates
    this change).
13. `npx nx run-many -t build` on the same 8 projects — all green (this also validates the
    TypeScript compile that vitest's transpile-only runner skips).
14. No `package.json` changes were needed (pure TS interface + implementation work), so no
    `yarn.lock` regeneration was required.
15. Committed with the message specified in the brief (Step 16), expanded with a body explaining
    the "why" per repo convention. Pre-commit hook (lint-staged + affected lint/test) passed
    without needing `--no-verify`.

## Deviations from the brief (with reasoning)

1. **Step 2's expected failure mode didn't materialize as described.** The brief expected the
   test run to fail to compile ("FAIL to compile ... AuthStrategy type-checking fails before the
   new tests even run"). In practice `npx nx test shared -- auth.contract.unit.test.ts` uses
   Vitest's esbuild transpile-only pipeline (no `tsc` type-check), so the interface gap surfaced as
   a runtime `TypeError: strategy.revoke is not a function` on all 3 new tests instead of a compile
   error. This still confirms the intended failing state (tests fail before implementation exists);
   noting it because the brief's stated mechanism was inaccurate for this repo's Vitest config, not
   because the outcome differs.

2. **Real gap in Step 9's expectation — fixed, not just noted.** The brief states: "mongodb/
   supabase/firebase are not exercised by `runAuthContract` directly in this repo's own test run".
   This is false for supabase and firebase: both `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts`
   and `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts` call
   `runAuthContract()` directly against the real strategy classes (with mocked SDK clients).
   Because the brief's 3 new revoke tests are unconditional (unlike the existing magic-link/OAuth
   tests, which are gated behind `if (helpers)` / `if (helpers?.getOAuthCode)`), running the full
   affected suite showed 3 failing tests each in `auth-supabase` and `auth-firebase` — a real
   regression, not a false alarm: `strategy.revoke()` correctly throws `not_implemented` per the
   brief's own Step 8 scope decision, but the unconditional contract tests expected it to succeed.

   Fix: added an optional `supportsRevoke?: boolean` flag to `AuthContractHelpers`
   (`libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`), mirroring the existing
   `helpers?.getOAuthCode` opt-in pattern. When `supportsRevoke === false`, the contract instead
   asserts a single test: "revoke rejects — strategy documents revoke as not implemented" (calls
   `revoke()` and expects it to reject). When absent/`true` (fake, postgres — no behavior change
   for either), the original 3 full-semantics tests run. Wired `supportsRevoke: false` into both
   `firebase-auth.contract.unit.test.ts` and `supabase-auth.contract.unit.test.ts`'s helpers object,
   each with a one-line comment pointing at the strategy's `revoke()` for the reasoning.

   This keeps the "postgres/mongodb/fake fully implement revoke; supabase/firebase intentionally
   don't" scope decision intact and *tested* on both sides (positive assertion for the 3 that
   support it, negative assertion for the 2 that don't) rather than silently skipping coverage for
   the unsupported providers. Considered leaving the contract test file untouched and just
   accepting the two broken suites as "expected per brief" — rejected, since a broken test suite
   left in the repo is a real CI regression regardless of what the brief predicted, and the brief's
   own "Global Constraints" call for all affected suites green.

3. **`mongodb`'s own contract test file doesn't exist** (verified via
   `find libs/auth-strategies -iname "*contract*"` — only `firebase`, `postgres`, `supabase` have
   one). So `auth-mongodb:test` was unaffected by the interface change beyond compiling, matching
   the brief's description for that one provider. Ran it anyway for completeness (15/15 pass).

## Test commands run and results

```
npx nx test shared -- auth.contract.unit.test.ts
  → 3 failed / 13 passed (expected pre-implementation failure; TypeError not compile error, see Deviation 1)

npx nx run-many -t test -p shared auth-postgres
  → shared: 10 files / 68 tests passed
  → auth-postgres: 3 files / 19 tests passed

npx nx test auth -- auth.controller.unit.test.ts
  → 1 file / 16 tests passed (includes the new logout regression test)

npx nx run-many -t test -p shared auth auth-client auth-postgres api
  → all green (first pass, before discovering the supabase/firebase gap)

npx nx run-many -t test -p auth-mongodb auth-supabase auth-firebase
  → auth-mongodb: 15/15 passed
  → auth-supabase: 3 failed / 15 passed  ← regression found (Deviation 2)
  → auth-firebase: 3 failed / 15 passed  ← regression found (Deviation 2)

[after supportsRevoke fix]
npx nx run-many -t test -p shared auth auth-client auth-postgres api auth-mongodb auth-supabase auth-firebase
  → shared: 10/10 files, 68/68 tests passed
  → auth: 5/5 files, 33/33 tests passed
  → auth-client: 1/1 file, 7/7 tests passed
  → auth-postgres: 3/3 files, 19/19 tests passed
  → api: 6/6 files, 33/33 tests passed
  → auth-mongodb: 3/3 files, 15/15 tests passed
  → auth-supabase: 2/2 files, 16/16 tests passed
  → auth-firebase: 2/2 files, 16/16 tests passed
  → ALL GREEN, 0 failures

npx prettier --write <all touched files>
  → "All files formatted correctly" (no changes needed)

npx nx run-many -t lint -p shared auth auth-client auth-postgres api auth-mongodb auth-supabase auth-firebase
  → 0 errors; 2 pre-existing warnings unrelated to this change (no-non-null-assertion in
    fake-db.ts and a pre-existing OAuth helper line in auth.contract.unit.test.ts)

npx nx run-many -t build -p shared auth auth-client auth-postgres api auth-mongodb auth-supabase auth-firebase
  → all 8 projects + 5 dependency tasks compiled successfully (full tsc type-check, catches what
    vitest's transpile-only run can't)
```

## Files changed

- `libs/shared/src/strategies/auth.ts` — `AuthStrategy.revoke()` interface method
- `libs/shared/src/strategies/fakes/fake-auth.ts` — `FakeAuthStrategy.revoke()`
- `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts` — 3 new contract cases +
  `supportsRevoke` opt-out flag (see Deviation 2)
- `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts` — `revoke()` via DELETE
- `libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts` — `revoke()` test double
- `libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts` — `revoke()` via `deleteOne`
- `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts` — `revoke()` throws `not_implemented`
- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts` —
  `supportsRevoke: false` (not in original brief file list — added to fix Deviation 2)
- `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts` — `revoke()` throws `not_implemented`
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts` —
  `supportsRevoke: false` (not in original brief file list — added to fix Deviation 2)
- `apps/microservices/auth/src/app/auth.controller.ts` — `auth.revoke` message pattern
- `apps/microservices/auth/src/app/__tests__/auth.controller.unit.test.ts` — logout regression test
- `libs/auth-client/src/lib/auth-client.service.ts` — `AuthClientService.revoke()`
- `apps/api/src/app/auth/auth.controller.ts` — `POST /auth/logout` route

## Not done / out of scope (by design, per brief)

- `supabase` and `firebase` do not have a working `revoke()` — intentional, documented in code
  comments and in this report, matching the brief's Step 8 scope decision.
- No changeset was added. Checked precedent: the preceding Task 1 commit (`468de22`, HMAC guard)
  also landed without a `.changeset/*.md` file despite AGENTS.md's "changeset for every PR" rule —
  consistent with this being an in-progress multi-task feature branch where the changeset is
  presumably added once at PR-open time (Task 3 / wrap-up), not per intermediate commit. Flagging
  this so whoever opens the PR remembers to add one before requesting review, per AGENTS.md.
