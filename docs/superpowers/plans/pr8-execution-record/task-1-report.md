# Task 1 Report: Narrow wire-provider.ts's error swallowing to ENOENT only

## Summary
Successfully completed Task 1 of the error-handling-and-replay-protection-polish plan. Narrowed overly-broad error swallowing in three functions (`mergeJsonDeps`, `stripJsonKeys`, `stripTsconfigKeys`) to only catch and ignore ENOENT errors, with all other errors properly propagated.

## Changes Made

### Files Modified
1. `tools/create-icore/src/manifest/wire-provider.ts`
2. `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`
3. `tools/create-icore/src/lib/scaffold-strip.ts` (additional fix required for tests to pass)

### Detailed Changes

#### wire-provider.ts
- Added `isEnoent()` helper function to check if an error is specifically an ENOENT (file not found) error
- Modified `mergeJsonDeps()`: Changed from bare `try/catch {}` to conditional re-throw — only ENOENT is caught, all other errors propagate
- Modified `stripJsonKeys()`: Changed from bare `try/catch {}` to conditional re-throw — only ENOENT is caught, all other errors propagate
- Modified `stripTsconfigKeys()`: Changed from bare `try/catch {}` to conditional re-throw — only ENOENT is caught, all other errors propagate

#### wire-provider.unit.test.ts
- Added import for `mergeJsonDeps`, `stripJsonKeys`, `stripTsconfigKeys` functions
- Added import alias `writeFile as writeFileNode` to avoid naming collision
- Added new test suite `mergeJsonDeps — error narrowing` with 2 tests:
  - "silently no-ops when the target file does not exist (ENOENT)"
  - "propagates a real error instead of swallowing it (malformed JSON)"
- Added new test suite `stripJsonKeys — error narrowing` with 2 tests:
  - "silently no-ops when the target file does not exist (ENOENT)"
  - "propagates a real error instead of swallowing it (malformed JSON)"
- Added new test suite `stripTsconfigKeys — error narrowing` with 2 tests:
  - "silently no-ops when tsconfig.base.json does not exist (ENOENT)"
  - "propagates a real error instead of swallowing it (malformed JSON)"

#### scaffold-strip.ts (Additional fix)
- Fixed `stripTsconfigPath()` to clean up trailing commas left by regex-based path stripping
- Added post-regex cleanup: `pretty.replace(/,(\s*[\]}])/g, '$1')` to remove dangling commas
- This was necessary because the regex-based stripping could leave invalid JSON that would cause JSON.parse to fail in downstream functions

## Test Results

### Step 1-2: Failing Tests (Before Fix)
Ran: `npx nx test create-icore -- wire-provider.unit.test.ts -t "error narrowing"`

Result: 3 tests failed as expected:
- `mergeJsonDeps — error narrowing > propagates a real error instead of swallowing it (malformed JSON)` — FAILED
- `stripJsonKeys — error narrowing > propagates a real error instead of swallowing it (malformed JSON)` — FAILED
- `stripTsconfigKeys — error narrowing > propagates a real error instead of swallowing it (malformed JSON)` — FAILED

All three failed because the functions were silently swallowing JSON.parse errors instead of propagating them.

### Step 4: Tests Pass (After Implementation)
Ran: `npx nx test create-icore -- wire-provider.unit.test.ts`

Result: All 11 tests in wire-provider.unit.test.ts PASSED
- 3 new error-narrowing tests now pass (ENOENT paths and error propagation)
- 5 pre-existing tests still pass (writeProvider and cleanupUnusedAxis behavior unchanged)
- 3 skipped tests (other test suites)

### Step 5: Full Suite Passes (After scaffold-strip.ts Fix)
Ran: `npx nx test create-icore`

Result: ALL 185 tests PASSED
- 16 test files all pass
- 0 failures
- Integration tests now pass after fixing the trailing comma issue in `stripTsconfigPath()`

### Lint Check
Ran: `npx nx lint create-icore`

Result: All files pass linting - No issues found

### Prettier Formatting
Ran: `npx prettier --write <files>`

Result: All files formatted correctly

## Key Implementation Details

### isEnoent Helper
```typescript
function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
}
```

This properly checks if an error is specifically ENOENT by:
1. Verifying it's an Error instance
2. Checking for the 'code' property
3. Casting to NodeJS.ErrnoException and checking the code value

### Error Handling Pattern
All three functions now follow this pattern:
1. Try to read the file
2. Catch any error from the read
3. If it's ENOENT, return early (legitimate partial fixture case)
4. Otherwise, re-throw the error
5. Continue with JSON.parse and write operations (these errors are NOT caught)

This ensures that malformed JSON, write errors, or other I/O issues are properly surfaced instead of being silently swallowed.

### scaffold-strip.ts Trailing Comma Fix
The regex-based stripping in `stripTsconfigPath` was leaving invalid JSON when removing tsconfig path entries. The fix adds:
```typescript
// Clean up any trailing commas left by removing a line
pretty = pretty.replace(/,(\s*[\]}])/g, '$1');
```

This removes trailing commas that appear before closing brackets/braces, which can occur when a path entry is removed from the middle of the paths object.

## Deviations from Brief

### Additional File Modified: scaffold-strip.ts
The brief specified only modifying `wire-provider.ts` and its test file. However, `scaffold-strip.ts` required modification to fix the integration tests. The issue was:

1. The `stripTsconfigPath()` regex in `scaffold-strip.ts` leaves invalid JSON with trailing commas
2. This invalid JSON is then read by `stripTsconfigKeys()` in the same execution flow
3. With the old code (catch-all error handling), this was silently ignored
4. With the new code (proper error propagation), it properly fails

The fix ensures `stripTsconfigPath()` generates valid JSON, preventing downstream parsing errors. This was necessary to keep all tests passing as expected by the brief.

## Verification

All success criteria met:
- ✅ New tests written that demonstrate error swallowing (6 new tests total)
- ✅ Tests initially fail to prove the bug
- ✅ Implementation narrowed error handling to ENOENT only
- ✅ All tests pass after implementation
- ✅ Full create-icore suite passes (185 tests)
- ✅ Lint check passes
- ✅ Prettier formatting applied
- ✅ Commit created with proper message
- ✅ Working tree clean

## Commit Hash
`73c6d2b` - fix(scaffold): narrow wire-provider.ts's error swallowing to ENOENT only
