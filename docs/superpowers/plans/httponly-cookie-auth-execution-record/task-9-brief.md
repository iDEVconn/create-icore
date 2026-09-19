### Task 9: `iCore` — rewire `create-api.ts`

**No `fetch-with-refresh.ts` exists in this repo, and this task drops it.** The original (pre-adaptation) version of this plan assumed a second, independent token consumer at `fetch-with-refresh.ts` used by an AI-chat SSE component — verified via `grep`/`glob` in this session: neither `fetch-with-refresh.ts` nor any AI-chat SSE component (`AiAssistant.tsx` or similar) exists anywhere in this repo. iCore's AI feature (`ai-orchestrator` microservice, `/api/ai/*` gateway routes, `apps/templates/client-shadcn/src/components/ai-usage/*`) is a plain JSON REST dashboard with no chart library and no streaming fetch wrapper — it goes through the same `createIcoreApi` client as everything else. If a future feature adds a raw/SSE fetch path that needs its own refresh handling, revisit this task then; there is nothing to rewire today.

**Files:**

- Modify: `libs/template-shared/src/lib/api/create-api.ts`

**Interfaces:**

- Consumes: `getAccessToken`/`setAccessToken` (Task 8, `libs/template-shared/src/lib/api/access-token.ts`).
- Consumes: `readCsrfCookie` (Task 8, `libs/template-shared/src/lib/api/csrf.ts`).

- [ ] **Step 1: Rewire `create-api.ts`**

The current contents (confirmed in this session):

```ts
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

Replace with:

```ts
import { createApiClient } from '@idevconn/api-client';
import { getAccessToken, setAccessToken } from './access-token.js';
import { readCsrfCookie } from './csrf.js';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    getAccessToken: () => getAccessToken(),
    getRefreshToken: () => 'cookie', // real token lives only in the httpOnly cookie; this is just a truthy guard
    getRefreshHeaders: () => {
      const csrf = readCsrfCookie();
      return csrf ? { 'X-CSRF-Token': csrf } : {};
    },
    // Response body is now {accessToken, user} only — no refreshToken field
    // (Task 4/5/7 drop it everywhere) — refreshRequestField/refreshTokenField
    // no longer apply.
    accessTokenField: 'accessToken',
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

Note: this does NOT route through `performSilentRefresh`/Web Locks — the underlying `@idevconn/api-client` library still owns its own refresh call internally (Task 1 only added `credentials`/`getRefreshHeaders` passthrough, not a pluggable refresh implementation). This is a known residual gap versus the spec's "fixed via Web Locks" intent — the library's own internal refresh call is unguarded by the Web Locks section `silent-refresh.ts` wraps `AuthBootstrap`'s boot-time call in (Task 11). In practice the two paths hitting `/auth/refresh` at nearly the same moment is rare (boot-time vs. a live 401), and the failure mode is just an extra login prompt for one tab — but flag this explicitly in review rather than assume it's fully closed, since the spec's stated intent was "fixed via Web Locks", full stop.

- [ ] **Step 2: Run the full `template-shared` and `client-shadcn` suites for regressions**

Run: `yarn nx test template-shared` then `yarn nx test client-shadcn`
Expected: PASS. Any test that stubbed `useAuthStore`'s `accessToken`/`refreshToken` fields directly (rather than `access-token.ts`) will fail — fix each to use `setAccessToken`/`getAccessToken` instead, per this task's new contract.

- [ ] **Step 3: Format, lint, build**

```bash
npx prettier --write libs/template-shared/src/lib/api/create-api.ts
yarn nx lint template-shared && yarn nx lint client-shadcn
yarn nx build template-shared && yarn nx build client-shadcn
```

- [ ] **Step 4: Commit**

```bash
git add libs/template-shared/src/lib/api/create-api.ts
git commit -m "feat(client): rewire create-api.ts onto the in-memory access token + CSRF-header refresh"
```

---
