### Task 4: Auth MS + auth-client

**Files:**

- Modify: `apps/microservices/auth/src/app/auth.controller.ts`
- Create: `apps/microservices/auth/src/app/__tests__/auth.controller.password-reset.unit.test.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts`
- Modify (append): `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`
- Modify: `tools/create-icore/src/manifest/index.ts` (register the new MS test under the supabase unit's `appTests`)

**Interfaces:**

- Consumes: strategy reset methods (Tasks 1–3).
- Produces: MS patterns `auth.password.forgot` `{email, callbackUrl}` → `{ok:true}`, `auth.password.reset` `{token, password}` → `AuthSession`; `AuthClientService.requestPasswordReset(email: string, callbackUrl: string): Promise<void>`, `AuthClientService.confirmPasswordReset(token: string, password: string): Promise<AuthSession>`; `invalid_reset_token` → `BadRequestException`.

- [ ] **Step 1: Write the failing tests.** MS test (provider-specific import → must be in `appTests`):

```ts
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthStrategy, createMockSupabaseClient } from '@icore/auth-supabase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController — password reset', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    return { mock, strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('forgot forwards email + callbackUrl to the strategy and answers {ok:true}', async () => {
    const { mock, controller } = fixture();
    await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    await expect(
      controller.requestPasswordReset({
        email: 'a@x.com',
        callbackUrl: 'https://my.app/reset-password',
      }),
    ).resolves.toEqual({ ok: true });
    expect(mock.getLastResetRedirect()).toBe('https://my.app/reset-password');
  });

  it('reset returns a session for the new password carrying the role', async () => {
    const { mock, strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    await controller.requestPasswordReset({ email: 'boss@x.com', callbackUrl: 'https://my.app/r' });

    const session = await controller.confirmPasswordReset({
      token: mock.getPasswordResetToken('boss@x.com'),
      password: 'newpw123!',
    });

    expect(session.user.email).toBe('boss@x.com');
    expect(await strategy.getRole(session.user.id)).toBe('admin');
    await expect(strategy.signIn('boss@x.com', 'newpw123!')).resolves.toBeTruthy();
  });

  it('reset with a bogus token rejects', async () => {
    const { controller } = fixture();
    await expect(
      controller.confirmPasswordReset({ token: 'nope', password: 'newpw123!' }),
    ).rejects.toBeTruthy();
  });
});
```

Add to `tools/create-icore/src/manifest/index.ts` supabase `appTests` the path `'apps/microservices/auth/src/app/__tests__/auth.controller.password-reset.unit.test.ts'`. auth-client tests (append in the existing `describe`):

```ts
it('requestPasswordReset sends email + callbackUrl and resolves against {ok:true}', async () => {
  const send = vi.fn(() => of({ ok: true as const }));
  const service = new AuthClientService({ send } as unknown as ClientProxy);
  await expect(
    service.requestPasswordReset('a@x.com', 'https://my.app/reset-password'),
  ).resolves.toBeUndefined();
  expect(send).toHaveBeenCalledWith('auth.password.forgot', {
    email: 'a@x.com',
    callbackUrl: 'https://my.app/reset-password',
  });
});

it('confirmPasswordReset sends token + password and maps invalid_reset_token to BadRequestException', async () => {
  const ok = vi.fn(() =>
    of({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
  );
  await new AuthClientService({ send: ok } as unknown as ClientProxy).confirmPasswordReset(
    'tok',
    'newpw123!',
  );
  expect(ok).toHaveBeenCalledWith('auth.password.reset', { token: 'tok', password: 'newpw123!' });

  const bad = vi.fn(() => throwError(() => new RpcException('invalid_reset_token')));
  await expect(
    new AuthClientService({ send: bad } as unknown as ClientProxy).confirmPasswordReset(
      'x',
      'newpw123!',
    ),
  ).rejects.toBeInstanceOf(BadRequestException);
});
```

(import `BadRequestException` from `@nestjs/common` in that test file.)

- [ ] **Step 2: Run to verify it fails** — `yarn nx test auth -- password-reset` and `yarn nx test auth-client`. Expected: FAIL (methods missing).

- [ ] **Step 3: Implement.** MS controller (after `verifyMagicLink`):

```ts
  @MessagePattern('auth.password.forgot')
  async requestPasswordReset(
    @Payload() payload: { email: string; callbackUrl: string },
  ): Promise<{ ok: true }> {
    await this.strategy.requestPasswordReset(payload.email, payload.callbackUrl);
    return { ok: true };
  }

  @MessagePattern('auth.password.reset')
  async confirmPasswordReset(
    @Payload() payload: { token: string; password: string },
  ): Promise<AuthSession> {
    const session = await this.strategy.confirmPasswordReset(payload.token, payload.password);
    await this.assignInitialRole(session.user.id, session.user.email);
    // Re-mint so the role is baked into the token (same as signup/magic-link).
    return this.strategy.refresh(session.refreshToken);
  }
```

auth-client: add `BadRequestException` to the `@nestjs/common` import, `invalid_reset_token: BadRequestException,` to `RPC_ERROR_MAP`, and:

```ts
  async requestPasswordReset(email: string, callbackUrl: string): Promise<void> {
    await firstValueFrom(this.send<{ ok: true }>('auth.password.forgot', { email, callbackUrl }));
  }

  confirmPasswordReset(token: string, password: string): Promise<AuthSession> {
    return mapRpcErrors(
      firstValueFrom(this.send<AuthSession>('auth.password.reset', { token, password })),
    );
  }
```

- [ ] **Step 4: Verify** — `yarn nx run-many -t test -p auth auth-client` PASS; `yarn nx run-many -t build lint -p auth auth-client` green; `yarn nx test create-icore` green (manifest test).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/microservices/auth/src libs/auth-client/src tools/create-icore/src/manifest/index.ts
git add apps/microservices/auth libs/auth-client tools/create-icore/src/manifest/index.ts
git commit -m "feat(auth): auth.password.forgot/reset MS patterns + auth-client methods"
```

---
