# Task 2 Report: PostgresAuthStrategy domain errors survive the TCP hop as RpcException

## Status: DONE

## Commit

`4e78435` — "fix(auth): convert postgres strategy domain errors to RpcException, map to HTTP exceptions at the gateway"

## Pre-work verification

Read the current state of the two files the brief warned might have drifted:

- `libs/auth-client/src/lib/auth-client.service.ts` — matched the brief's described Task 1 baseline exactly (`setRole`/`sendMagicLink` already return via `{ ok: true }` internally, with a comment explaining why). No discrepancy — proceeded to apply the brief's Step 6 version on top.
- `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts` — matched the brief's "before" snippets exactly (plain `Error('invalid_credentials')`, `Error('user_already_exists', { cause: err })`, `Error('invalid_refresh_token')`, `Error('user_not_found')`, `Error('invalid_token', { cause: err })`). No discrepancy.
- `libs/auth-strategies/postgres/package.json` — matched the brief's "before" (no `@nestjs/microservices` dep).
- `libs/auth-strategies/postgres/src/lib/testing/mock-postgres-auth.ts` — already throws plain `Error` with the exact domain messages used by the brief's Step 1 tests; no changes needed there.

No NEEDS_CONTEXT triggers found — proceeded per brief.

## What was done

1. **Step 1 + 2b (test-first):** Created `libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts` with all 4 tests from the brief (3 baseline mock-double tests + the `RpcException` instance-type regression test against the real `PostgresAuthStrategy`), verbatim from the brief.

2. **Step 2 confirm baseline:** Ran `npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts` before any strategy changes.
   - Result: 3 passed (mock-double message assertions), 1 failed — `AssertionError: expected Error: invalid_token to be an instance of RpcException`. Matches the brief's predicted outcome exactly.

3. **Step 3:** Edited `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`:
   - Added `import { RpcException } from '@nestjs/microservices';`
   - `verifyToken`: catch block now `catch { throw new RpcException('invalid_token'); }` (dropped the `cause: err` wrapping per brief's replacement).
   - `signIn`: both `invalid_credentials` throws converted to `RpcException`.
   - `signUp`: duplicate-email (`23505`) throw converted to `RpcException('user_already_exists')` (dropped `cause: err`); the `throw err;` fallback for other DB errors left untouched.
   - `refresh`: `invalid_refresh_token` and `user_not_found` throws converted to `RpcException`.

4. **Step 4:** Added `"@nestjs/microservices": "^11.1.27"` to `libs/auth-strategies/postgres/package.json` dependencies (matching the version already used in `auth-client`).

5. **Step 5 confirm fix:** Re-ran `npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts` → 4/4 passed. Then ran full `npx nx test auth-postgres` → 3 test files, 16/16 passed (includes pre-existing `postgres-auth.contract.unit.test.ts` and `postgres-auth.module.unit.test.ts`, unaffected as predicted).

6. **Step 6:** Overwrote `libs/auth-client/src/lib/auth-client.service.ts` with the brief's full final content: added `RPC_ERROR_MAP`, `rpcMessage()`, `mapRpcErrors<T>()` helpers, and wired `login`/`signup`/`refresh` through `mapRpcErrors(...)`. `verify`, `setRole`, `sendMagicLink`, `verifyMagicLink`, `startOAuth`, `completeOAuth` left as in Task 1's version (untouched by the brief's Step 6, since only login/signup/refresh needed mapping).

7. **Step 7:** Added the "AuthClientService — RPC error mapping" `describe` block to `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`, appended after the existing Task 1 `describe` block, verbatim from the brief (imports for `throwError`, `RpcException`, `ConflictException`, `UnauthorizedException` added to the top of the file).

8. **Step 8 confirm:** Ran `npx nx test auth-client` → 1 test file, 5/5 passed (2 Task-1 tests + 3 new mapping tests).

9. **Prettier + lint (Global Constraint, brief Step 9):**
   - `npx prettier --write <5 touched files>` — reformatted the new mapping tests onto single lines (Prettier's own line-length collapsing); no manual edits needed after.
   - `npx nx lint auth-postgres` → clean, 0 errors.
   - `npx nx lint auth-client` → clean, 0 errors.
   - Re-ran both test suites after the prettier pass to confirm no regressions: `auth-postgres` 16/16 passed (cache hit, same result), `auth-client` 5/5 passed.

10. **Commit:** Staged exactly the 5 files listed in the brief and committed with the brief's exact message. Verified branch was `bug/auth-rpc-boundary-hygiene` (correct) before committing.

## Exact test commands run and their pass/fail output

```
$ npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts   (before Step 3 fix)
 ✓ signIn with wrong password rejects with invalid_credentials
 ✓ signUp with a duplicate email rejects with user_already_exists
 ✓ refresh with an unknown token rejects with invalid_refresh_token
 × domain errors from the real strategy are RpcException instances ...
   AssertionError: expected Error: invalid_token to be an instance of RpcException
 Test Files  1 failed (1) | Tests  1 failed | 3 passed (4)

$ npx nx test auth-postgres -- postgres-auth.strategy.unit.test.ts   (after Step 3+4 fix)
 ✓ |auth-postgres| src/lib/__tests__/postgres-auth.strategy.unit.test.ts (4 tests)
 Test Files  1 passed (1) | Tests  4 passed (4)

$ npx nx test auth-postgres   (full suite)
 ✓ postgres-auth.strategy.unit.test.ts (4 tests)
 ✓ postgres-auth.module.unit.test.ts (3 tests)
 ✓ postgres-auth.contract.unit.test.ts (9 tests)
 Test Files  3 passed (3) | Tests  16 passed (16)

$ npx nx test auth-client   (full suite, after Step 6/7)
 ✓ auth-client.service.unit.test.ts (5 tests)
 Test Files  1 passed (1) | Tests  5 passed (5)

$ npx nx lint auth-postgres   → 0 errors
$ npx nx lint auth-client     → 0 errors
```

## Deviations from the brief

None. Followed the brief's code verbatim for the test file, the strategy edits, the package.json dependency, and the full `auth-client.service.ts` replacement. The only non-code-content change was Prettier's automatic line-collapsing of the three new mapping test assertions (`.rejects.toBeInstanceOf(...)` calls) from the brief's multi-line form to single-line form — purely cosmetic, required by the project's mandatory pre-commit Prettier pass, no semantic difference.

## Files touched

- `/home/vladimir-tkach/Projects/22/.claude/worktrees/bug+auth-rpc-boundary-hygiene/libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`
- `/home/vladimir-tkach/Projects/22/.claude/worktrees/bug+auth-rpc-boundary-hygiene/libs/auth-strategies/postgres/package.json`
- `/home/vladimir-tkach/Projects/22/.claude/worktrees/bug+auth-rpc-boundary-hygiene/libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.strategy.unit.test.ts` (new)
- `/home/vladimir-tkach/Projects/22/.claude/worktrees/bug+auth-rpc-boundary-hygiene/libs/auth-client/src/lib/auth-client.service.ts`
- `/home/vladimir-tkach/Projects/22/.claude/worktrees/bug+auth-rpc-boundary-hygiene/libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
