# Task 2: Client API layer token field overrides

## Summary
Successfully implemented the fix to match `@idevconn/api-client` token field names to the gateway's camelCase AuthSession contract. This fixes the silent token refresh failure where JWT_EXPIRES_IN was forcing premature user logouts.

## Changes Made

### 1. Created test file
- **File**: `libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts`
- **Purpose**: Test that `createIcoreApi()` overrides the token field names to match gateway's camelCase contract
- **Test**: Verifies that `createApiClient` is called with:
  - `refreshRequestField: 'refreshToken'`
  - `accessTokenField: 'accessToken'`
  - `refreshTokenField: 'refreshToken'`

### 2. Implemented token field overrides
- **File**: `libs/template-shared/src/lib/api/create-api.ts`
- **Change**: Added three field overrides to the `createApiClient` config:
  - `refreshRequestField: 'refreshToken'` (was using snake_case default)
  - `accessTokenField: 'accessToken'` (was using snake_case default)
  - `refreshTokenField: 'refreshToken'` (was using snake_case default)
- **Rationale**: The gateway's `AuthSession` contract is camelCase end-to-end. Without these overrides, the client's automatic refresh silently no-ops when looking for snake_case fields that don't exist in the gateway response.

### 3. Fixed eslint configuration
- **File**: `libs/template-shared/eslint.config.mjs`
- **Change**: Added `'vitest'` to `ignoredDependencies` array
- **Reason**: vitest is a workspace dev dependency available in node_modules; it should not be required as a direct dependency in package.json

## Test Results

### Step 1: Initial test (expected to fail)
```
Command: npx nx test template-shared -- create-api.unit.test.ts

Result: FAIL (as expected)
Error: createApiClient was called WITHOUT the three override fields
```

### Step 2: Test after implementation fix
```
Command: npx nx test template-shared -- create-api.unit.test.ts

Result: PASS
✓ |template-shared| src/lib/api/__tests__/create-api.unit.test.ts (1 test) 11ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Step 3: Full test suite
```
Command: npx nx test template-shared

Result: PASS
✓ |template-shared| src/lib/api/__tests__/create-api.unit.test.ts (1 test) 9ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Step 4: Prettier check
```
Command: npx prettier --write libs/template-shared/src/lib/api/create-api.ts libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts

Result: All files formatted correctly
```

### Step 5: Lint check
```
Command: npx nx lint template-shared

Result: PASS (after adding vitest to ignoredDependencies)
NX   Successfully ran target lint for project template-shared
```

## Deviations from Brief
Minor deviation: The brief did not mention updating `eslint.config.mjs` to add 'vitest' to `ignoredDependencies`, but this was required for the lint check to pass. This follows the existing pattern used by other projects in the workspace (e.g., storage-strategies/*, auth-strategies/*).

## Commit Hash
- **Hash**: `a151cdf`
- **Message**: `fix(client): match api-client token fields to the gateway's camelCase AuthSession contract`
- **Files Changed**:
  - `libs/template-shared/src/lib/api/create-api.ts`
  - `libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts`
  - `libs/template-shared/eslint.config.mjs`

## Root Cause Analysis
The gateway's `POST /auth/refresh` endpoint expects and returns camelCase token field names (`refreshToken`, `accessToken`). The `@idevconn/api-client` library defaults to snake_case field names (`refresh_token`, `access_token`). Without the overrides:
1. Client sends `{ refresh_token: '...' }` but gateway reads `body.refreshToken` (undefined)
2. Client looks for `response.access_token` / `response.refresh_token` but gateway returns `accessToken` / `refreshToken`
3. The automatic token refresh silently fails
4. User is force-logged-out when the JWT expires (default 15 minutes)

The fix ensures the client uses camelCase field names matching the gateway contract, enabling proper automatic token refresh.
