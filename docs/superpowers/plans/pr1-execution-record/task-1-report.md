# Task 1 Report: Auth MS Re-mints Session After Role Assignment

## Summary
Fixed a bug where the first JWT token returned after user signup, magic-link verification, or OAuth completion lacked the role claim, causing role-gated checks to fail until the next login or token refresh. The fix is straightforward: after assigning the initial role, call `refresh()` on the session's refresh token to re-mint both tokens with the role baked in.

## What Was Done

### Step 1: Created Failing Test
Created `/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts` with two test cases that verify the first access token carries the assigned role:
- `signup: the FIRST accessToken already carries the role assignInitialRole just wrote` — verifies admin role
- `signup: non-admin email also gets its role baked into the first token` — verifies user role

### Step 2: Verified Test Fails
Ran `npx nx test auth --no-cache` and confirmed both tests failed with:
```
AssertionError: expected undefined to be 'admin'
AssertionError: expected undefined to be 'user'
```

### Step 3: Implemented Fix
Modified `/apps/microservices/auth/src/app/auth.controller.ts` in three handlers:

1. **`signup` handler (lines 31-39)**: After `assignInitialRole()`, added `return this.strategy.refresh(session.refreshToken);`
2. **`verifyMagicLink` handler (lines 56-61)**: Same change
3. **`completeOAuth` handler (lines 70-81)**: Same change

Each call now re-mints the session so the JWT includes the newly-assigned role.

### Step 4: Verified Test Passes
Ran `npx nx test auth --no-cache` and confirmed both postgres integration tests now pass:
```
✓ |auth| src/app/__tests__/auth.controller.postgres.integration.unit.test.ts (2 tests) 150ms
Test Files  4 passed (4)
Tests  27 passed (27)
```

### Step 5: Ran Full Test Suite
Full suite confirms no regressions:
- Existing `auth.controller.unit.test.ts` (15 tests) — all pass
- Existing `auth.controller.supabase.integration.unit.test.ts` (5 tests) — all pass
- Existing `auth.controller.firebase.integration.unit.test.ts` (5 tests) — all pass
- New `auth.controller.postgres.integration.unit.test.ts` (2 tests) — both pass

**Total: 27 tests passed across 4 test files.**

### Step 6: Committed
```bash
npx prettier --write <files>  # Already formatted correctly
npx nx lint auth             # Passed with no issues
git add <files>
git commit -m "fix(auth): re-mint session after role assignment..."
```

**Commit hash: `3bd1655`**

## Technical Details

### Root Cause
- `PostgresAuthStrategy.signUp()` returns a session with `{ id, email }` but no role (the role doesn't exist yet)
- `AuthController.signup()` calls `assignInitialRole()` to write the role to Postgres
- But then returns the *pre-assignment* session
- JWT-based strategies bake the role claim at sign time (`createSession()` in postgres-auth.strategy.ts:187-191)
- So the returned token has no role claim — it won't refresh until the client's next login

### Why This Solution Works
- `strategy.refresh(refreshToken)` takes the just-issued refresh token (still valid)
- Creates a new session from fresh data fetched from Postgres (now includes the assigned role)
- Bakes the role into the new JWT during `createSession()`
- Returns both tokens with the role claim present

### Why Existing Tests Didn't Catch This
- `FakeAuthStrategy` (used by `auth.controller.unit.test.ts`) doesn't bake role into JWTs — it does a *live* lookup on `verifyToken()` and finds the role that was just assigned
- So the existing tests pass even with the bug
- Only `createMockPostgresAuth()` (the JWT-based test double) reproduces the real behavior faithfully

## Files Changed
- Modified: `/apps/microservices/auth/src/app/auth.controller.ts` (3 handlers updated)
- Created: `/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts` (2 test cases)

## Test Results Summary
- **Before fix**: 2 failed, 25 passed (27 total)
- **After fix**: 0 failed, 27 passed (27 total)
- **Regression check**: All existing tests continue to pass
