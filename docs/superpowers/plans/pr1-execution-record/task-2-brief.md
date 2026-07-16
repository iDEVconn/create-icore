### Task 2: Client API layer matches the gateway's camelCase refresh contract

**Files:**
- Modify: `libs/template-shared/src/lib/api/create-api.ts`
- Create: `libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts`

**Interfaces:**
- Consumes: `createApiClient(config: ApiClientConfig)` from `@idevconn/api-client` — `refreshRequestField`, `accessTokenField`, `refreshTokenField` are optional config fields whose defaults are `refresh_token` / `access_token` / `refresh_token` (verified in `node_modules/@idevconn/api-client/dist/index.d.ts:34-39`).
- Produces: no signature change to `createIcoreApi()`.

**Root cause:** The gateway's `AuthSession` (`libs/shared/src/strategies/auth.ts:1-6`) and its `POST /auth/refresh` route (`apps/api/src/app/auth/auth.controller.ts:84-86`, reads `body.refreshToken`) are camelCase end-to-end. `@idevconn/api-client`'s defaults are snake_case (`refresh_token`, `access_token`). `create-api.ts` never overrides them, so the client's automatic refresh sends `{ refresh_token: '...' }` — the gateway reads `body.refreshToken`, gets `undefined`, and the refresh silently fails (or 400s). Even if the request body happened to work, the client then looks for `response.access_token`/`response.refresh_token` in the camelCase `AuthSession` response and finds neither. Net effect: the automatic access-token refresh never functions, and the user is force-logged-out at `JWT_EXPIRES_IN` (default `15m`).

- [ ] **Step 1: Write the failing test**

```typescript
// libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@idevconn/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
  return { ...actual, createApiClient: vi.fn(() => vi.fn()) };
});

import { createApiClient } from '@idevconn/api-client';
import { createIcoreApi } from '../create-api';

describe('createIcoreApi', () => {
  it('overrides the token field names to match the gateway camelCase AuthSession contract', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshRequestField: 'refreshToken',
        accessTokenField: 'accessToken',
        refreshTokenField: 'refreshToken',
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test template-shared -- create-api.unit.test.ts`
Expected: FAIL — `createApiClient` was called without the three override fields.

- [ ] **Step 3: Add the field overrides**

```typescript
// libs/template-shared/src/lib/api/create-api.ts
import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    // Gateway's AuthSession contract is camelCase end-to-end (accessToken /
    // refreshToken on both the /auth/refresh request body and response) —
    // override the client lib's snake_case defaults or the automatic refresh
    // silently no-ops and the user is force-logged-out at JWT_EXPIRES_IN.
    refreshRequestField: 'refreshToken',
    accessTokenField: 'accessToken',
    refreshTokenField: 'refreshToken',
    onTokenRefreshed: ({ accessToken, refreshToken }) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth({ accessToken, refreshToken, user });
    },
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test template-shared -- create-api.unit.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full template-shared suite to confirm no regression**

Run: `npx nx test template-shared`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/template-shared/src/lib/api/create-api.ts libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
npx nx lint template-shared
git add libs/template-shared/src/lib/api/create-api.ts libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
git commit -m "fix(client): match api-client token fields to the gateway's camelCase AuthSession contract"
```

---

