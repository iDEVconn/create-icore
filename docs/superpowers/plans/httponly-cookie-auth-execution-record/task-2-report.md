# Task 2 Completion Report: iCore Cookie + CSRF Helpers

**Task:** Implement pure, standalone cookie/CSRF helper functions for httpOnly refresh-token auth hardening.  
**Date:** 2026-09-19  
**Status:** DONE

## What Was Implemented

Created `libs/shared/src/http/auth-cookies.ts` with 5 core functions:

1. **`setAuthCookies(res, opts)`** — Sets two cookies on the response:
   - `icore_rt` (refresh token): httpOnly, path `/api/auth`, 30-day max-age
   - `icore_csrf` (CSRF token): readable by client JS, same path and max-age
   - Both use SameSite=None + Secure in production; SameSite=Lax + no Secure in dev

2. **`clearAuthCookies(res, opts)`** — Clears both cookies at their shared path (`/api/auth`)

3. **`readRefreshToken(req)`** — Safely extracts `icore_rt` from `req.cookies`, returns `undefined` if absent

4. **`verifyCsrf(req)`** — Double-submit validation: compares `X-CSRF-Token` header to `icore_csrf` cookie, returns `false` if either is missing or they don't match

5. **`generateCsrfToken()`** — Generates 32 random bytes via `crypto.randomBytes`, encoded as hex

### Test Coverage

Created `libs/shared/src/http/__tests__/auth-cookies.unit.test.ts` with 10 tests (all passing):

- **setAuthCookies:** 3 tests covering httpOnly flag, SameSite/Secure behavior in both prod and dev
- **clearAuthCookies:** 1 test verifying both cookies cleared at correct path
- **readRefreshToken:** 2 tests for happy path and undefined when missing
- **verifyCsrf:** 3 tests for match, mismatch, and missing values
- **generateCsrfToken:** 1 test verifying randomness and non-empty output

### Export Wiring

Updated `libs/shared/src/index.ts` to export `./http/auth-cookies`, making all functions available to consumers of the `@icore/shared` package.

### Dependency Addition

Added `express@^5.2.0` to `libs/shared/package.json` (was missing but required for `Request`/`Response` type imports).

## TDD Evidence

### RED Phase (Failing Tests)

```
yarn nx test shared --testNamePattern="auth-cookies|..."
FAIL src/http/__tests__/auth-cookies.unit.test.ts
Error: Cannot find module '../auth-cookies'
Expected: FAIL — module doesn't exist yet. ✓
```

### GREEN Phase (Passing Tests)

```
Test Files: 1 passed | 10 skipped (11)
Tests: 10 passed | 68 skipped (78)
Duration: 519ms
Expected: PASS — all 10 tests passing. ✓
```

## Files Changed

1. **Created:** `/home/vladimir-tkach/Projects/22/libs/shared/src/http/auth-cookies.ts` (42 lines)
   - Pure functions with no side effects
   - Uses `node:crypto` for token generation
   - Type-safe with full TypeScript coverage

2. **Created:** `/home/vladimir-tkach/Projects/22/libs/shared/src/http/__tests__/auth-cookies.unit.test.ts` (128 lines)
   - Mocks Express Request/Response via Vitest
   - Tests both happy and error paths
   - Fixed non-null assertions to pass ESLint

3. **Modified:** `/home/vladimir-tkach/Projects/22/libs/shared/src/index.ts`
   - Added 1 export line: `export * from './http/auth-cookies';`

4. **Modified:** `/home/vladimir-tkach/Projects/22/libs/shared/package.json`
   - Added `express@^5.2.0` to dependencies

## Quality Checklist

✓ **Code Style:** Follows existing lib conventions (relative imports without `.js` suffix, consistent spacing)  
✓ **Testing:** All 10 tests passing, covers all 5 functions and edge cases  
✓ **Linting:** No errors, no new warnings introduced (2 pre-existing warnings in auth.contract.unit.test.ts and fake-db.ts are unrelated)  
✓ **Build:** `yarn nx build shared` succeeds  
✓ **TDD Discipline:** Tests written first (RED), implementation (GREEN), then refactored for linting  
✓ **Documentation:** Functions have clear signatures with JSDoc intent (types communicate intent)  
✓ **No Breaking Changes:** Only additions to shared lib, backward compatible  
✓ **Prettier:** All files formatted, no drift

## Commit

**SHA:** `9ab6e92` (feature/httponly-cookie-auth)  
**Message:** `feat(shared): add httpOnly refresh-cookie + CSRF helpers`

Includes all 4 files with full attribution per project guidelines.

## Self-Review Findings

**None.** The implementation:

- Matches the brief exactly (all 5 functions, all test cases)
- Integrates cleanly with existing `libs/shared` architecture
- Passes all pre-submission checks (prettier → lint → build → tests)
- Introduces no new linting errors
- Follows this repo's TypeScript and testing conventions

This module is a pure foundation — no consumers yet; Tasks 3+ (gateway controller changes) will import and wire these helpers.

---

## Post-Submission Fix Report

### Issue Found

Reviewer identified critical issue: `express` was added to `dependencies`, but `auth-cookies.ts` only uses type imports (`import type { Request, Response } from 'express'`). A type-only import should not pull in a runtime dependency per this repo's conventions (verified against `apps/api/package.json`).

### Fix Applied

**Commit SHA:** `6de7513`  
**Message:** `fix(shared): move express to peerDependencies (types-only usage)`

**Changes:**

- Removed `"express": "^5.2.0"` from `dependencies`
- Added `"@types/express": "^5.0.6"` to `devDependencies` (matching apps/api's pinned range)
- Added `"express": "^5.0.0"` to `peerDependencies` (signals to library consumers that express must be available)

**Verification:**

1. **Install + Lockfile Update:**

   ```bash
   yarn install
   ```

   ✓ Succeeded with no errors related to shared lib

2. **Lint Check:**

   ```bash
   yarn nx lint shared
   ```

   ✓ PASS — 0 errors, 2 pre-existing warnings (unrelated to auth-cookies module)

3. **Build Check:**

   ```bash
   yarn nx build shared
   ```

   ✓ PASS — TypeScript compilation clean

4. **Test Suite:**
   ```bash
   yarn nx test shared -t "auth-cookies|setAuthCookies|clearAuthCookies|readRefreshToken|verifyCsrf|generateCsrfToken"
   ```
   ✓ PASS — All 10 tests passing (11ms)

### Architecture Alignment

- **Before:** `express` in dependencies (wrong for a library, bloats consumers)
- **After:** `@types/express` in devDependencies + `express` in peerDependencies (correct pattern)
- **Pattern verified against:** `apps/api/package.json` (the only place in this repo that runs express servers)

No functional code changed; only package metadata corrected. All tests, lint, and build remain green.
