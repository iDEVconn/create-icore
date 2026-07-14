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

