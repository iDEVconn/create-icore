# Task 2 — test-coverage gap fix report

## What was added

File: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`

1. Parameterized the existing `fixture()` helper to accept an optional
   `pkgDeps?: Record<string, string>` argument. When omitted, it keeps the
   original behavior (all four auth providers' deps pre-seeded in
   `apps/microservices/auth/package.json`), so every existing test is
   unaffected. When passed, it lets a test control exactly which deps start
   present — no fixture duplication needed.

2. Added a new test inside `describe('writeAuthProvider', ...)`:
   `'merges postgres deps into a package.json that never had them, mirroring
   the real auth template'`.
   - Builds the fixture with a `dependencies` map containing only
     `@icore/auth-supabase`, `@icore/auth-firebase`, `@supabase/supabase-js`
     — matching the real `apps/microservices/auth/package.json` at repo root,
     which never lists `@icore/auth-postgres`/`postgres`/`bcrypt`/
     `jsonwebtoken` (verified by reading that file directly).
   - Calls `writeAuthProvider(dir, 'postgres')` alone (no `cleanupUnusedAuth`
     first) — isolates the merge behavior from the cleanup step, since the
     gap being closed is specifically about `writeProvider()`'s merge logic
     in `wire-provider.ts`, not the cleanup/prune path (already covered by
     the `cleanupUnusedAuth` describe block below).
   - Asserts the resulting package.json's `dependencies` now contain
     `@icore/auth-postgres: '*'`, `postgres: '^3'`, `bcrypt: '^6'`,
     `jsonwebtoken: '^9'` — these exact version strings were read from
     `MANIFEST.auth.postgres.deps` in
     `tools/create-icore/src/manifest/index.ts` (not guessed).

## Why isolated call, not cleanup+write

The generator's real invocation order does run `cleanupUnusedAuth` before
`writeAuthProvider`, but that combined path is already exercised implicitly
by the existing `cleanupUnusedAuth` tests (which prune to the chosen
provider) — those don't call `writeAuthProvider` afterward, so they don't
prove the merge. The actual gap flagged in review is narrower: prove
`writeAuthProvider('postgres')` alone performs the merge against a
realistic (missing-postgres-deps) starting package.json. Isolating the call
keeps the test focused on that one behavior and keeps failure output
unambiguous (a failure here can only be the merge, not an interaction with
cleanup).

## Test output

`npx nx test create-icore -- wire-auth.unit.test.ts`:
- 16 test files run (full suite runs as one vitest project), wire-auth.unit.test.ts
  shows 5 tests passed (was 4, now 5 with the new case).
- Test Files 16 passed (16), Tests 179 passed (179).

`npx nx test create-icore` (full suite, no filter):
- Test Files 16 passed (16), Tests 179 passed (179) — no regressions.

## Lint / format

- `npx prettier --write tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`
  → "All files formatted correctly" (no changes needed after edits).
- `npx nx lint create-icore` → "All files pass linting".

## Files touched

- `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts` (test-only change)
