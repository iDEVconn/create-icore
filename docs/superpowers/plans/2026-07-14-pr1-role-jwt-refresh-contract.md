# PR1: Role-on-first-token + refresh-field contract mismatch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two gaps found by a live audit of the `ui=shadcn` + `authProvider=postgres` + `dbProvider=postgres` blueprint in `tools/create-icore`: (1) the JWT the auth MS hands back on signup/magic-link/OAuth completion doesn't carry the role that was just assigned to the user, and (2) the generated client's API layer never overrides `@idevconn/api-client`'s snake_case token-field defaults to match the gateway's camelCase `AuthSession` contract, so the silent-refresh flow never actually refreshes.

**Architecture:** Both fixes are surgical, no new abstractions. Gap 1: the auth MS controller already has a working token-refresh path (`AuthStrategy.refresh()`); re-use it to re-mint the session after `assignInitialRole()` runs instead of returning the pre-assignment session. Gap 2: pass three explicit field-name overrides into `createApiClient()`.

**Tech Stack:** NestJS microservices (`@MessagePattern`), Vitest, `@idevconn/api-client`, Zustand.

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`, not the underlying tool directly.
- TDD: write the failing test first, watch it fail, then implement.
- `npx prettier --write <touched files>` before every commit — no exceptions.
- `nx lint <project>` must be 0 errors and `nx build <project>` must be green before commit, per the post-coding routine.
- Every PR needs a `.changeset/<slug>.md` — `patch` bump, frontmatter `--- "@idevconn/create-icore": patch ---`.
- Branch: `bug/postgres-role-jwt-refresh-contract` cut from `dev`. PR base is `dev` (`gh pr create --base dev ...`). Never push to `main`, never merge autonomously.
- Files touched here live under `tools/create-icore/templates/...` — these are the generator's source templates, not a scaffolded project. They are also live, testable Nx projects in this repo (confirmed: `apps/microservices/auth` → project `auth`; `libs/template-shared` → project `template-shared`).

---

### Task 1: Auth MS re-mints the session after role assignment

**Files:**
- Modify: `tools/create-icore/templates/apps/microservices/auth/src/app/auth.controller.ts:31-36,53-58,67-78`
- Create: `tools/create-icore/templates/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts`

**Interfaces:**
- Consumes: `AuthStrategy.refresh(refreshToken: string): Promise<AuthSession>` (already exists on the interface, `tools/create-icore/templates/libs/shared/src/strategies/auth.ts:30`).
- Produces: no new public signatures — `signup`, `verifyMagicLink`, `completeOAuth` keep their existing return types (`Promise<AuthSession>`).

**Root cause:** `PostgresAuthStrategy.signUp()` returns a session built from `{ id, email }` with no role (`postgres-auth.strategy.ts:121`) — the role doesn't exist yet at that point. `AuthController.signup()` then calls `assignInitialRole()` to set the role in Postgres, but returns the *original* pre-assignment session. Since `createSession()` bakes `role` into the JWT at sign time (`postgres-auth.strategy.ts:187-191`), the very first access token a new user receives has no role claim — any role-gated check against that token (client-side route guard, `@CheckAbility` on the gateway) fails until the user's next login or token refresh. The same pattern repeats in `verifyMagicLink` and `completeOAuth` (both call `assignInitialRole` then return the pre-assignment `session`).

`createMockPostgresAuth()` (the JWT-based test double already used by `postgres-auth.contract.unit.test.ts`) reproduces this faithfully, unlike `FakeAuthStrategy`, whose `verifyToken()` does a *live* lookup of `user.role` instead of decoding a baked claim — so the existing `auth.controller.unit.test.ts` (which uses `FakeAuthStrategy`) cannot catch this regression class.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/create-icore/templates/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { createMockPostgresAuth } from '@icore/auth-postgres';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController × PostgresAuthStrategy × role-on-first-token', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const strategy = createMockPostgresAuth();
    return { strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('signup: the FIRST accessToken already carries the role assignInitialRole just wrote', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    const verified = await strategy.verifyToken(session.accessToken);
    expect(verified.role).toBe('admin');
  });

  it('signup: non-admin email also gets its role baked into the first token', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'normal@x.com', password: 'pw12345!' });
    const verified = await strategy.verifyToken(session.accessToken);
    expect(verified.role).toBe('user');
  });
});
```

Note: `verifyMagicLink` and `completeOAuth` get the identical one-line fix in Step 3 (same `assignInitialRole` → stale-session pattern), but `PostgresAuthStrategy` doesn't implement magic-link or OAuth (`throw new Error('not_implemented')`), so `createMockPostgresAuth()` can't exercise those two paths. The mechanism is proven once here; the other two call sites are covered by inspection since it's the same substitution, not new logic.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test auth -- auth.controller.postgres.integration.unit.test.ts`
Expected: FAIL — first test's `verified.role` is `undefined`, not `'admin'`.

- [ ] **Step 3: Fix the three call sites in the MS controller**

```typescript
// tools/create-icore/templates/apps/microservices/auth/src/app/auth.controller.ts
// Replace the signup handler:
  @MessagePattern('auth.signup')
  async signup(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    const session = await this.strategy.signUp(payload.email, payload.password);
    await this.assignInitialRole(session.user.id, session.user.email);
    // Re-mint via refresh(): JWT-based strategies bake `role` into the token at
    // sign time, so the pre-assignment session's token would otherwise report
    // no role until the client's next login or refresh.
    return this.strategy.refresh(session.refreshToken);
  }

// Replace the verifyMagicLink handler:
  @MessagePattern('auth.magicLink.verify')
  async verifyMagicLink(@Payload() payload: { token: string }): Promise<AuthSession> {
    const session = await this.strategy.verifyMagicLink(payload.token);
    await this.assignInitialRole(session.user.id, session.user.email);
    return this.strategy.refresh(session.refreshToken);
  }

// Replace the completeOAuth handler:
  @MessagePattern('auth.oauth.complete')
  async completeOAuth(
    @Payload() payload: { provider: OAuthProvider; code: string; state: string },
  ): Promise<AuthSession> {
    const session = await this.strategy.completeOAuth(
      payload.provider,
      payload.code,
      payload.state,
    );
    await this.assignInitialRole(session.user.id, session.user.email);
    return this.strategy.refresh(session.refreshToken);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test auth -- auth.controller.postgres.integration.unit.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Run the full existing auth controller suite to confirm no regression**

Run: `npx nx test auth`
Expected: PASS — `auth.controller.unit.test.ts` and `auth.controller.supabase.integration.unit.test.ts` are unaffected (`FakeAuthStrategy` and `SupabaseAuthStrategy` both tolerate the extra `refresh()` round-trip since it only requires the just-issued `refreshToken` to be valid, which it is).

- [ ] **Step 6: Commit**

```bash
npx prettier --write tools/create-icore/templates/apps/microservices/auth/src/app/auth.controller.ts tools/create-icore/templates/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts
npx nx lint auth
git add tools/create-icore/templates/apps/microservices/auth/src/app/auth.controller.ts tools/create-icore/templates/apps/microservices/auth/src/app/__tests__/auth.controller.postgres.integration.unit.test.ts
git commit -m "fix(auth): re-mint session after role assignment so the first JWT carries the role"
```

---

### Task 2: Client API layer matches the gateway's camelCase refresh contract

**Files:**
- Modify: `tools/create-icore/templates/libs/template-shared/src/lib/api/create-api.ts`
- Create: `tools/create-icore/templates/libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts`

**Interfaces:**
- Consumes: `createApiClient(config: ApiClientConfig)` from `@idevconn/api-client` — `refreshRequestField`, `accessTokenField`, `refreshTokenField` are optional config fields whose defaults are `refresh_token` / `access_token` / `refresh_token` (verified in `node_modules/@idevconn/api-client/dist/index.d.ts:34-39`).
- Produces: no signature change to `createIcoreApi()`.

**Root cause:** The gateway's `AuthSession` (`libs/shared/src/strategies/auth.ts:1-6`) and its `POST /auth/refresh` route (`apps/api/src/app/auth/auth.controller.ts:84-86`, reads `body.refreshToken`) are camelCase end-to-end. `@idevconn/api-client`'s defaults are snake_case (`refresh_token`, `access_token`). `create-api.ts` never overrides them, so the client's automatic refresh sends `{ refresh_token: '...' }` — the gateway reads `body.refreshToken`, gets `undefined`, and the refresh silently fails (or 400s). Even if the request body happened to work, the client then looks for `response.access_token`/`response.refresh_token` in the camelCase `AuthSession` response and finds neither. Net effect: the automatic access-token refresh never functions, and the user is force-logged-out at `JWT_EXPIRES_IN` (default `15m`).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/create-icore/templates/libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
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
// tools/create-icore/templates/libs/template-shared/src/lib/api/create-api.ts
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
npx prettier --write tools/create-icore/templates/libs/template-shared/src/lib/api/create-api.ts tools/create-icore/templates/libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
npx nx lint template-shared
git add tools/create-icore/templates/libs/template-shared/src/lib/api/create-api.ts tools/create-icore/templates/libs/template-shared/src/lib/api/__tests__/create-api.unit.test.ts
git commit -m "fix(client): match api-client token fields to the gateway's camelCase AuthSession contract"
```

---

### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr1-role-jwt-refresh-contract.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two auth contract gaps in generated projects: the auth MS now re-mints the session after assigning a user's initial role, so the first JWT a client receives already carries it (previously only visible after the next login/refresh); the client's create-api.ts now overrides @idevconn/api-client's snake_case token-field defaults to match the gateway's camelCase AuthSession contract, so automatic token refresh actually works instead of silently no-op'ing and force-logging-out users at JWT_EXPIRES_IN.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p auth template-shared`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr1-role-jwt-refresh-contract.md
git commit -m "chore: add changeset for PR1 role/refresh-contract fixes"
```

## Self-Review

- **Spec coverage:** Gap #1 (JWT drops role) → Task 1. Gap #2 (refresh-token field mismatch) → Task 2. Both closed.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `AuthController.signup/verifyMagicLink/completeOAuth` keep `Promise<AuthSession>`; `createIcoreApi` keeps its existing signature. No cross-task signature drift.
