# Task 9: Fix `refresh()` error normalization across auth strategies (Supabase, MongoDB, Firebase)

## Problem

`AuthGuard.refreshSession` (`apps/api/src/app/auth/auth.guard.ts`) distinguishes a genuinely
dead refresh token (401, delete session) from a transient auth-service outage (503, keep
session) by checking `message.includes('invalid_refresh_token')` on whatever `authClient.refresh()`
throws.

This only worked for `PostgresAuthStrategy`, which already throws `RpcException('invalid_refresh_token')`.
NestJS's RPC exception filter preserves an `RpcException`'s message across the gateway↔microservice
transport; a plain `Error` gets its message discarded entirely by the filter's
`handleUnknownError` path, so `SupabaseAuthStrategy`, `MongoDbAuthStrategy`, and
`FirebaseAuthStrategy` (all of which threw plain `Error`s on refresh failure) always fell through
to the guard's 503 path — even for a permanently dead session. Since Supabase is this repo's
documented default provider, this hit the common case, not an edge case.

## What I implemented

1. **`libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`**
   - Added `import { RpcException } from '@nestjs/microservices';`.
   - `refresh()`: changed `throw new Error(error?.message ?? 'invalid_refresh_token')` to
     `throw new RpcException('invalid_refresh_token')`. Per the task brief, Supabase's own error
     wording is not preserved — the app's normalized error code is what matters, matching the
     other strategies.

2. **`libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts`**
   - Added `import { RpcException } from '@nestjs/microservices';`.
   - `refresh()`: changed only the `throw new Error('invalid_refresh_token')` (dead/expired
     session lookup) to `throw new RpcException('invalid_refresh_token')`. Left the unrelated
     `throw new Error('user_not_found')` a few lines below untouched — out of scope.

3. **`libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`**
   - Added `import { RpcException } from '@nestjs/microservices';`.
   - `refresh()`: wrapped `this.identityToolkit.refresh(refreshToken)` in try/catch; any
     rejection (whatever provider-specific string the low-level `HttpIdentityToolkitClient`
     throws — `INVALID_REFRESH_TOKEN`, `USER_DISABLED`, a network failure, etc.) now normalizes
     to `throw new RpcException('invalid_refresh_token')`. Per the brief's preference, the fix is
     at the `AuthStrategy` boundary, not in `identity-toolkit.client.ts` — that low-level HTTP
     client's own error semantics are untouched, matching where Postgres/MongoDB/Supabase all
     normalize (inside the strategy, not a lower-level client).

4. **Dependency wiring**: `@nestjs/microservices` was not previously a declared dependency of
   `auth-supabase`, `auth-mongodb`, or `auth-firebase` (only `auth-postgres` had it). Added
   `"@nestjs/microservices": "^11.2.5"` to each of the three `package.json`s' `dependencies`
   (matching the version pin postgres already uses) and ran `yarn install` to update `yarn.lock`
   — a 3-line addition registering the new workspace consumers against the already-resolved
   `@nestjs/microservices@npm:^11.2.5` entry (no version change, no new package fetched).

## Tests added

- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts` — new
  `describe('SupabaseAuthStrategy — refresh()')` block: calling `refresh()` with a bogus token
  throws an error that `instanceof RpcException` and whose `.getError()` is
  `'invalid_refresh_token'`.
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts` — new
  `describe('FirebaseAuthStrategy — refresh()')` block, same assertions, against the mock
  identity-toolkit client (which throws `INVALID_REFRESH_TOKEN` for an unknown token — verifying
  the strategy normalizes it away).
- `libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.strategy.unit.test.ts` — added a
  nested `describe('refresh()')` inside the existing `describe('MongoDbAuthStrategy', ...)` block
  (which already sets up a `mongodb-memory-server` + real `mongoose` connection for
  `runAuthContract`). Used a fresh `MongoDbAuthStrategy` instance sharing the same connection
  (rather than the contract test's shared `strategy` variable, to avoid coupling to contract-test
  execution order) and asserted the same `instanceof RpcException` / `.getError()` checks. This
  was the natural home — no dedicated `MongoDbAuthStrategy`-only unit test file existed before
  this task, but the strategy already had a direct (non-contract) test file with the real
  mongo connection wired up, so no new test infrastructure was needed.

I verified `RpcException`'s actual shape by reading
`node_modules/@nestjs/microservices/exceptions/rpc-exception.js`: it extends `Error`, and
`getError()` returns exactly the value passed to the constructor (a string, here), so
`.getError()` and `instanceof RpcException` are both meaningful, non-trivial assertions.

## Test results

- `yarn nx test auth-supabase` — 3 files, 21 tests passed (incl. the new one).
- `yarn nx test auth-firebase` — 3 files, 21 tests passed (incl. the new one).
- `yarn nx test auth-mongodb` — 3 files, 16 tests passed (incl. the new one).
- `yarn nx run-many -t lint -p auth-supabase auth-mongodb auth-firebase` — 0 errors.
- `yarn nx run-many -t build -p auth-supabase auth-mongodb auth-firebase` — all green (also
  rebuilt `shared` and `firebase-admin` dependencies via cache/local build, no failures).
- `npx prettier --check` on every touched file (3 strategy `.ts` files, 3 test files, 3
  `package.json`, `yarn.lock`) — clean.

## Files changed

- `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`
- `libs/auth-strategies/supabase/package.json`
- `libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts`
- `libs/auth-strategies/mongodb/src/lib/__tests__/mongodb-auth.strategy.unit.test.ts`
- `libs/auth-strategies/mongodb/package.json`
- `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`
- `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts`
- `libs/auth-strategies/firebase/package.json`
- `yarn.lock` (3-line addition registering the new dependency edges)

`apps/api/src/app/auth/auth.guard.ts` and `libs/auth-strategies/postgres/**` were read for
context but not modified — no changes needed there.

## Self-review

- Completeness: all 3 strategies fixed; MongoDB's unrelated `user_not_found` throw left as a
  plain `Error` (out of scope, untouched); Firebase fixed at the `AuthStrategy` boundary
  (`firebase-auth.strategy.ts`), not the low-level `identity-toolkit.client.ts`, per the brief's
  stated preference.
- Quality: `RpcException` imported in all 3 strategy files and all 3 test files; no unused
  imports left behind (confirmed via lint, which would flag unused imports).
- Discipline: Postgres untouched; no other files in these libs modified besides the 3
  `package.json`s (needed for the new `RpcException` import to resolve as a declared dependency)
  and `yarn.lock`.
- Testing: each new test asserts both `instanceof RpcException` and `.getError() === 'invalid_refresh_token'`
  — not just "throws something" — after confirming `RpcException`'s real shape from its source.

No issues or concerns found during self-review.

## Concerns

None. The `docs/live-testing-supabase-accounts.md` untracked file visible in `git status` predates
this task and is unrelated — left alone and not committed.
