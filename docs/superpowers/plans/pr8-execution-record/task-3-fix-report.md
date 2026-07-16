# Task 3 Fix Report: stripTsconfigPath Error-Handling Consistency

## Summary

Fixed error-handling inconsistency in `tools/create-icore/src/lib/scaffold-strip.ts`'s `stripTsconfigPath()` function. The function had a blanket try-catch wrapping its entire body, silently swallowing all errors—not just file absence. This was the exact anti-pattern Task 1 set out to fix, and its twin in `scaffold-auth-none.ts` had already been corrected (commit `63f232f`). This file was missed.

## Changes Made

### 1. Modified: `tools/create-icore/src/lib/scaffold-strip.ts`

**Added helper function (lines 5-7):**
```typescript
function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
```

**Refactored `stripTsconfigPath()` (lines 30-53):**
- Extracted `readFile()` into its own try-catch block
- Narrowed catch to ENOENT only; re-throws all other errors
- Moved all JSON parsing, regex operations, and `writeFile()` calls outside the try-catch
- Now propagates real errors (malformed JSON, write failures) instead of silently swallowing them
- Still gracefully returns early on ENOENT, preserving tolerance for missing tsconfig in test scaffolds

### 2. Created: `tools/create-icore/src/lib/__tests__/scaffold-strip.unit.test.ts`

Added comprehensive tests for `removeFirebaseAdminLib()` with two critical cases:

**Test 1: ENOENT gracefully no-ops**
- Verifies that missing `tsconfig.base.json` does not throw
- Confirms the function tolerates file absence as designed

**Test 2: Real errors propagate**
- Creates a malformed JSON tsconfig to trigger `JSON.parse()` error
- Confirms that the error is thrown, not swallowed
- This test was previously failing (promise resolved instead of rejecting)

## Test Results

### Before Fix
```
scaffold-strip.unit.test.ts: 1 failed (malformed JSON test)
AssertionError: promise resolved "undefined" instead of rejecting
```

### After Fix
```
Test Files  18 passed (18)
Tests       188 passed (188)
```

All tests pass, including the two new ones for `scaffold-strip.ts`.

## Verification Steps Completed

1. **Test execution** — All 188 tests pass (18 test files)
2. **Linting** — `yarn nx lint create-icore` passes (0 errors)
3. **Build** — `yarn nx build create-icore` succeeds (87.68 KB ESM, 93.78 KB CJS)
4. **Code consistency** — `scaffold-strip.ts` now mirrors the exact pattern from `scaffold-auth-none.ts`

## Code Review Notes

The fix is a direct mechanical mirror of the already-approved correction in `scaffold-auth-none.ts`. No architectural changes; error-handling now consistent across both files. The `isEnoent()` helper is reusable and follows the same pattern established in the twin file.

## Commit Hash
`187c175`
