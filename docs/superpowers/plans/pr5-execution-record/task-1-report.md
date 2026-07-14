# Task 1 Report: Root pnpm devDep workaround covers postgres too

## Summary

Fixed a scoping bug in the `create-icore` Nx generator where the pnpm root-devDep workaround for `@types/bcrypt` and `@types/jsonwebtoken` only applied to `authProvider=mongodb`, even though `authProvider=postgres` imports the exact same two packages and requires the same workaround.

## Changes Made

### 1. Test Changes (scaffold.unit.test.ts)

Added two new test cases to the `describe('rewriteRootPackageJson — mongodb deps')` block (lines 1170-1188):

- **Test 1:** `adds @types/bcrypt and @types/jsonwebtoken to devDeps when authProvider=postgres`
  - Verifies that postgres auth strategy gets the `@types/*` devDeps
  - Initially failed with: `AssertionError: expected undefined to be defined`

- **Test 2:** `does not add @types/bcrypt when neither auth provider needs it`
  - Verifies that the deps are NOT added when using non-postgres/non-mongodb providers
  - Ensures we don't accidentally add these for providers that don't need them

### 2. Source Change (scaffold-env.ts)

Modified the condition at lines 145-152 in `rewriteRootPackageJson()`:

**Before:**
```typescript
if (opts.authProvider === 'mongodb') {
  const devDeps = (pkg['devDependencies'] ??= {}) as Record<string, string>;
  devDeps['@types/bcrypt'] = '^6.0.0';
  devDeps['@types/jsonwebtoken'] = '^9.0.10';
}
```

**After:**
```typescript
if (opts.authProvider === 'mongodb' || opts.authProvider === 'postgres') {
  const devDeps = (pkg['devDependencies'] ??= {}) as Record<string, string>;
  devDeps['@types/bcrypt'] = '^6.0.0';
  devDeps['@types/jsonwebtoken'] = '^9.0.10';
}
```

Also updated the comment to reflect that both postgres and mongodb auth strategies need this workaround.

## Verification Steps Executed

1. **Initial test failure** (as expected):
   - Ran: `npx nx test create-icore -- scaffold.unit.test.ts -t "authProvider=postgres"`
   - Result: Test failed with `AssertionError: expected undefined to be defined` on line 1172

2. **Applied fix** to condition

3. **Specific test pass**:
   - Ran: `npx nx test create-icore -- scaffold.unit.test.ts -t "@types/bcrypt"`
   - Result: All 3 related tests passed (1 existing + 2 new)

4. **Full suite test**:
   - Ran: `npx nx test create-icore`
   - Result: **177 tests passed** across 16 test files, zero regressions

5. **Code quality checks**:
   - Ran: `npx prettier --write <files>`
   - Result: All files formatted correctly
   - Ran: `npx nx lint create-icore`
   - Result: All files pass linting

## Commit Details

- **Hash:** `985442f`
- **Message:** `fix(scaffold): add @types/bcrypt + @types/jsonwebtoken root devDeps for authProvider=postgres`
- **Files changed:** 2
  - `tools/create-icore/src/lib/scaffold-env.ts` (updated condition and comment)
  - `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` (added 2 new tests)

## Root Cause Analysis

Under pnpm's strict node_modules isolation, when a project is generated with `authProvider=postgres`, the build command `nx build` (which runs from the workspace root) cannot resolve `@types/bcrypt` and `@types/jsonwebtoken` because:

1. These are devDependencies of `libs/auth-strategies/postgres`
2. pnpm does not hoist them to the root `node_modules`
3. TypeScript cannot find them during compilation

The fix ensures that when postgres is the chosen auth provider, these `@types` packages are added to the ROOT `devDependencies`, making them available during the root-level `nx build` process. This mirrors the existing behavior for mongodb auth strategy.

## Test Coverage

The fix is covered by:
- Existing test: `adds @types/bcrypt and @types/jsonwebtoken to devDeps when authProvider=mongodb`
- New test: `adds @types/bcrypt and @types/jsonwebtoken to devDeps when authProvider=postgres`
- New test: `does not add @types/bcrypt when neither auth provider needs it` (negative case)

All three tests ensure the condition is working correctly and prevent regressions.
