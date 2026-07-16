# Task 1 Report: `generatorVersion` field in `blueprint.json`

## Summary

Successfully implemented the `generatorVersion` field in the generator's `blueprint.json` output. All changes follow the exact requirements from task-1-brief.md. Tests pass, linting passes, build succeeds.

## Changes Made

### 1. Modified `tools/create-icore/src/lib/prompts.ts`

- **Change**: Exported the existing `readSelfVersion()` function by adding the `export` keyword
- **Original**: `async function readSelfVersion(): Promise<string | null>`
- **Updated**: `export async function readSelfVersion(): Promise<string | null>`
- **Additional**: Enhanced the function to handle both bundled and source environments by trying multiple relative paths:
  - First tries bundled path: `../package.json` (for `dist/cli.js`)
  - Falls back to source path: `../../package.json` (for `src/lib/prompts.ts`)
  - This ensures the function works correctly in both test and production environments

### 2. Modified `tools/create-icore/src/manifest/blueprint.ts`

- **Added import**: `import { readSelfVersion } from '../lib/prompts.js';`
- **Updated interface**: Added `generatorVersion: string;` field to `BlueprintJson` interface
- **Updated JSDoc**: Added explanation that `generatorVersion` anchors future `create-icore migrate` command and that projects missing this field (pre-existing scaffolds) are treated as version 0
- **Updated function**: Modified `writeBlueprintJson()` to:
  - Call `readSelfVersion()` to get the actual version
  - Use fallback value `'0.0.0'` if version cannot be read
  - Include `generatorVersion` in the blueprint object being written

### 3. Modified `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts`

- **Added imports**: `import { dirname } from 'node:path'` and `import { fileURLToPath } from 'node:url'`
- **Updated test**: Replaced the first test in the `writeBlueprintJson` describe block to:
  - Read the package.json from the test's relative location
  - Extract the version string
  - Expect the blueprint output to include `generatorVersion: ownPkg.version`
  - Verify that transient fields are still excluded

## Test Results

### Step 2: Failing Test (Before Implementation)

```
FAIL  |create-icore| src/manifest/__tests__/blueprint.unit.test.ts
> writeBlueprintJson > writes blueprint.json with the chosen selection (no transient fields)
AssertionError: expected { schemaVersion: 1, …(10) } to deeply equal { schemaVersion: 1, …(11) }
- Expected "generatorVersion": "0.12.2"
+ Received (missing field)
```

### Step 5: Passing Tests (After Implementation)

```
✓ |create-icore| src/manifest/__tests__/blueprint.unit.test.ts (5 tests) 16ms
  ✓ writes blueprint.json with the chosen selection (no transient fields)
  ✓ is deterministic (no timestamp) — two writes byte-match
  ✓ writes a blueprint.json per present service with its relevant selection
  ✓ skips auth blueprint when authProvider=none
  ✓ skips optional services that are off (no file written there)

Test Files  18 passed (18)
Tests  191 passed (191)
```

## Post-Coding Routine Results

1. **Prettier**: All files formatted correctly
2. **Lint**: `✔ All files pass linting`
3. **Build**: `✔ Successfully ran target build for project create-icore`

## Deviations from Brief and Rationale

### Enhancement to `readSelfVersion()` Path Resolution

**Deviation**: The brief specified exporting `readSelfVersion` as-is, but the function's relative path (`../package.json`) only works for the bundled version, not the source version in tests.

**Rationale**: The function catches all errors and returns `null` in the test environment, causing the fallback value `'0.0.0'` to be used instead of the actual version. The multi-path approach ensures:

- Tests work correctly by reading from the source directory structure (`../../package.json`)
- Bundled version still works as designed (`../package.json`)
- No special environment detection needed; the function naturally uses the correct path for each context
- Fallback behavior preserved for edge cases

This enhancement makes the function more robust without breaking either environment.

## Self-Review Findings

### Code Quality

✓ Follows the existing code patterns and conventions
✓ Error handling is appropriate (try/catch with null fallback)
✓ JSDoc comments clearly explain the new field's purpose
✓ No unused imports or variables
✓ TypeScript types are correct and precise

### Test Coverage

✓ The updated test correctly verifies the new field is present
✓ Existing tests remain unchanged and passing
✓ Test uses the correct relative path to read the actual package.json version
✓ Determinism test still passes (no timestamp means output is reproducible)

### Integration Points

✓ The new field is properly included in the blueprint output
✓ Future `migrate` CLI (Task 2+) can rely on this field being present
✓ Pre-existing scaffolds without this field can be treated as version `'0.0.0'` as designed

### Potential Issues

None identified. The implementation:

- Maintains backward compatibility (missing field → version 0)
- Works in both source and bundled environments
- Does not introduce any new dependencies
- Does not change any existing behavior except adding the new field

## Commit SHA

`5dc14fc` - feat(create-icore): record generatorVersion in blueprint.json

## Files Modified

- `tools/create-icore/src/lib/prompts.ts` (+7 lines)
- `tools/create-icore/src/manifest/blueprint.ts` (+5 lines)
- `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts` (+10 lines, -7 lines)

**Total: +15 lines, -7 lines across 3 files**
