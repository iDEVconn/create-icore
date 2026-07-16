# Task 2 Report: Migration Entry Schema + `.migration.yml` Parser

## Summary
Successfully implemented Task 2 of the migration-registry build pipeline feature. Created the `.migration.yml` schema validation module with full test coverage.

## Changes Made

### 1. Modified Files
- **tools/create-icore/package.json**: Added devDependencies
  - `js-yaml@^4.1.1`
  - `@types/js-yaml@^4.0.9`
  
- **yarn.lock**: Updated (regenerated via `yarn install`)

### 2. Created Files
- **tools/create-icore/src/migrations/schema.ts** (70 lines)
  - Exported `MigrationKind` type: `'codemod' | 'ai-prompt'`
  - Exported `MigrationEntry` interface with fields: id, kind, affectedAxes, affectedGlobs, commitRange, description
  - Implemented `parseMigrationYaml(raw: string, sourcePath: string): MigrationEntry` function
  - Includes validation logic with clear error messages that include the source path
  - Validates: non-empty strings, enum kinds, non-empty arrays, commit range format (7-40 hex chars per side)

- **tools/create-icore/src/migrations/__tests__/schema.unit.test.ts** (113 lines)
  - Test suite with 9 test cases covering:
    - Valid YAML parsing
    - Missing id field
    - Invalid kind value
    - Empty affectedAxes
    - Empty affectedGlobs
    - Malformed commitRange
    - Missing description
    - Non-mapping YAML top-level
    - Source path inclusion in error messages

## Test Results

### Before Implementation
- **Test Files**: 1 failed, 18 passed (19 total)
- **Tests**: 191 passed
- **Failure**: "Cannot find module '../schema.js'" - expected behavior confirming test setup was correct

### After Implementation
- **Test Files**: 19 passed (19 total)
- **Tests**: 200 passed (200 total)
- **parseMigrationYaml**: All 9 tests pass
- **Total suite increase**: +9 tests (191 → 200)

## Deviations from Brief
None. All steps followed exactly as specified:
1. Added devDependencies in correct order (alphabetical)
2. Ran `yarn install` successfully
3. Created test file with exact content from brief
4. Verified test failure (module not found)
5. Implemented schema.ts with exact content from brief
6. Verified all 9 tests pass
7. Formatted with prettier
8. Committed with specified message

## Self-Review Findings

### Code Quality
- ✓ Type safety: Full TypeScript with no `any` types
- ✓ Error handling: Clear, path-inclusive error messages
- ✓ Validation: Comprehensive checks for all required fields
- ✓ Regex pattern: COMMIT_RANGE_RE correctly validates 7-40 hex chars per side
- ✓ Helpers: Pure functions (isNonEmptyString, isNonEmptyStringArray) for reusability

### Test Coverage
- ✓ Happy path: Valid YAML parsing
- ✓ Field validation: All 6 fields tested individually
- ✓ Error messages: Confirm error text matches expected patterns
- ✓ Error context: Verify sourcePath is included in thrown errors
- ✓ Type safety: Comprehensive test assertions

### Dependencies
- ✓ js-yaml@^4.1.1: Industry-standard YAML parser, stable version
- ✓ @types/js-yaml@^4.0.9: TypeScript types for js-yaml
- ✓ No peer dependency issues introduced

### Export Stability
The exported names match the brief requirements exactly:
- `MigrationKind` type (used by Tasks 3-5)
- `MigrationEntry` interface (used by Tasks 3-5)
- `parseMigrationYaml` function (used by Tasks 3-5)

## Integration Notes
- Placed in `tools/create-icore/src/migrations/schema.ts` as specified
- Test file follows project convention in `__tests__/schema.unit.test.ts`
- All tests run via `yarn nx test create-icore`
- Module ready for import by Task 3 (registry builder)

## Commit
- **SHA**: 292074a
- **Message**: "feat(create-icore): add migration entry schema + .migration.yml parser"
- **Files**: 4 changed, 167 insertions

## Critical Lint Review Fix

### Issue
Commit 292074a triggered `nx lint create-icore` failure with `@nx/dependency-checks` error: `js-yaml` was imported by real source (`src/migrations/schema.ts`) but only added to `devDependencies`, not `dependencies`.

### Root Cause Analysis
The schema module is build-tooling only — invoked via `tsx` at release time to generate the registry, never shipped to end-users via the npm package. The published bundle only includes three entry points:
- `src/cli.ts`
- `src/manifest/audit.ts`
- `src/index.ts`

`src/migrations/**` is never included in the tsup build, so `js-yaml` should not be a runtime `dependency`.

### Solution
Added `'js-yaml'` to the existing `ignoredDependencies` allowlist in `tools/create-icore/eslint.config.mjs` (line 25), matching the pattern already used for `tsup` and `vitest` — both are build/test tooling dependencies that should never be required by consumers:

```js
ignoredDependencies: ['tsup', 'vitest', 'js-yaml'],
```

### Verification

**Linting:**
```
yarn nx lint create-icore
✔ All files pass linting
NX Successfully ran target lint for project create-icore
```

**Correction:** the first fix attempt (reported as SHA `211e989`) was committed to `dev` in the main repo checkout instead of this feature branch's worktree — a subagent checkout-drift mistake, caught during re-review. That stray commit was dropped from `dev` (unpushed, safe to reset) and the fix was re-applied correctly on this branch as `5b5fa99`.

**Tests (re-verified on the correct branch/worktree):**
```
yarn nx test create-icore --skip-nx-cache
Test Files: 19 passed (19)
Tests: 200 passed (200)
NX Successfully ran target test for project create-icore
```

**Lint (re-verified):**
```
yarn nx lint create-icore --skip-nx-cache
All files pass linting
```

### Commit
- **SHA**: 5b5fa99
- **Message**: "fix(create-icore): allowlist js-yaml as build-tooling-only dependency"
- **Files**: 1 changed, 1 insertion
