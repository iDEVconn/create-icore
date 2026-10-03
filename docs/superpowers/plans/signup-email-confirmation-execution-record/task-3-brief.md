### Task 3: Auth MS + auth-client — carry the new outcome across the RPC boundary

**Files:**

- Modify: `apps/microservices/auth/src/app/auth.controller.ts` (`signup`, imports)
- Create: `apps/microservices/auth/src/app/__tests__/auth.controller.signup-confirmation.unit.test.ts`
- Modify: `libs/auth-client/src/lib/auth-client.service.ts` (`RPC_ERROR_MAP`, `signup`, imports)
- Modify (append): `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts`

**Interfaces:**

- Consumes: `EmailConfirmationRequiredError`, `SignUpConfirmationRequired` (Task 1); `createMockSupabaseClient({requireEmailConfirmation})` (Task 2).
- Produces: MS `auth.signup` payload `{ email, password, callbackUrl? }` → `AuthSession | SignUpConfirmationRequired`; `AuthClientService.signup(email: string, password: string, callbackUrl?: string): Promise<AuthSession | SignUpConfirmationRequired>`; `email_not_confirmed` → `ForbiddenException`.

- [ ] **Step 1: Write the failing MS test** — `auth.controller.signup-confirmation.unit.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthStrategy, createMockSupabaseClient } from '@icore/auth-supabase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController.signup × email confirmation required', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    return { mock, strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('returns { status: "confirmation_required", user } instead of throwing', async () => {
    const { controller } = fixture();
    const result = await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    expect(result).toMatchObject({
      status: 'confirmation_required',
      user: { email: 'a@x.com' },
    });
  });

  it('still assigns the initial role (user) even though no session exists yet', async () => {
    const { strategy, controller } = fixture();
    const result = await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    if (!('status' in result)) throw new Error('expected confirmation_required');
    expect(await strategy.getRole(result.user.id)).toBe('user');
  });

  it('assigns admin to an ADMINS_LIST email', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const result = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    if (!('status' in result)) throw new Error('expected confirmation_required');
    expect(await strategy.getRole(result.user.id)).toBe('admin');
  });

  it('forwards callbackUrl to the strategy as the email redirect', async () => {
    const { mock, controller } = fixture();
    await controller.signup({
      email: 'a@x.com',
      password: 'pw12345!',
      callbackUrl: 'https://my.app/auth/callback',
    });
    expect(mock.getLastSignUpOptions()).toEqual({
      emailRedirectTo: 'https://my.app/auth/callback',
    });
  });

  it('propagates real errors (e.g. user exists) unchanged', async () => {
    const { controller } = fixture();
    await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    await expect(controller.signup({ email: 'a@x.com', password: 'pw12345!' })).rejects.toThrow(
      'user exists',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test auth --testFile=auth.controller.signup-confirmation`
Expected: FAIL (controller rethrows `EmailConfirmationRequiredError`).

- [ ] **Step 3: Implement the MS change** — in `apps/microservices/auth/src/app/auth.controller.ts` replace the import block's `@icore/shared` type import with:

```ts
import { EmailConfirmationRequiredError } from '@icore/shared';
import type {
  AuthSession,
  AuthStrategy,
  OAuthProvider,
  OAuthStartResult,
  SignUpConfirmationRequired,
  VerifiedToken,
} from '@icore/shared';
```

and replace `signup`:

```ts
  @MessagePattern('auth.signup')
  async signup(
    @Payload() payload: { email: string; password: string; callbackUrl?: string },
  ): Promise<AuthSession | SignUpConfirmationRequired> {
    let session: AuthSession;
    try {
      session = await this.strategy.signUp(payload.email, payload.password, {
        callbackUrl: payload.callbackUrl,
      });
    } catch (err) {
      if (err instanceof EmailConfirmationRequiredError) {
        // Account exists, no session until the user confirms. The role is
        // assigned now so the first post-confirmation login already has it.
        await this.assignInitialRole(err.user.id, err.user.email);
        return { status: 'confirmation_required', user: err.user };
      }
      throw err;
    }
    await this.assignInitialRole(session.user.id, session.user.email);
    // Re-mint via refresh(): JWT-based strategies bake `role` into the token at
    // sign time, so the pre-assignment session's token would otherwise report
    // no role until the client's next login or refresh.
    return this.strategy.refresh(session.refreshToken);
  }
```

- [ ] **Step 4: Write the failing auth-client tests** — append inside the existing `describe` in `libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts` (check the file's imports; add `ForbiddenException` to the `@nestjs/common` import if absent):

```ts
it('signup forwards callbackUrl in the RPC payload', async () => {
  const send = vi.fn(() =>
    of({ status: 'confirmation_required', user: { id: 'u1', email: 'a@x.com' } }),
  );
  const service = new AuthClientService({ send } as unknown as ClientProxy);

  const result = await service.signup('a@x.com', 'pw12345!', 'https://my.app/auth/callback');

  expect(send).toHaveBeenCalledWith('auth.signup', {
    email: 'a@x.com',
    password: 'pw12345!',
    callbackUrl: 'https://my.app/auth/callback',
  });
  expect(result).toMatchObject({ status: 'confirmation_required' });
});

it('maps email_not_confirmed to ForbiddenException', async () => {
  const send = vi.fn(() => throwError(() => new RpcException('email_not_confirmed')));
  const service = new AuthClientService({ send } as unknown as ClientProxy);

  await expect(service.login('a@x.com', 'pw12345!')).rejects.toBeInstanceOf(ForbiddenException);
});
```

(If `of` is not yet imported from `rxjs` in that file, add it next to `throwError`.)

- [ ] **Step 5: Run to verify it fails**, then **implement** `auth-client.service.ts`:

Run: `yarn nx test auth-client` → FAIL. Then edit: import `ForbiddenException` from `@nestjs/common` (alongside the existing ones), import types `SignUpConfirmationRequired` from `@icore/shared`, add to the map and replace `signup`:

```ts
const RPC_ERROR_MAP: Record<string, new (message: string) => Error> = {
  user_already_exists: ConflictException,
  invalid_credentials: UnauthorizedException,
  invalid_refresh_token: UnauthorizedException,
  user_not_found: UnauthorizedException,
  email_not_confirmed: ForbiddenException,
};
```

```ts
  signup(
    email: string,
    password: string,
    callbackUrl?: string,
  ): Promise<AuthSession | SignUpConfirmationRequired> {
    return mapRpcErrors(
      firstValueFrom(
        this.send<AuthSession | SignUpConfirmationRequired>('auth.signup', {
          email,
          password,
          callbackUrl,
        }),
      ),
    );
  }
```

- [ ] **Step 6: Run to verify both pass**

Run: `yarn nx test auth && yarn nx test auth-client` — Expected: PASS (existing signup/ADMINS_LIST tests unchanged).

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/microservices/auth/src/app/auth.controller.ts apps/microservices/auth/src/app/__tests__/auth.controller.signup-confirmation.unit.test.ts libs/auth-client/src/lib/auth-client.service.ts libs/auth-client/src/lib/__tests__/auth-client.service.unit.test.ts
git add apps/microservices/auth libs/auth-client
git commit -m "feat(auth): auth.signup returns confirmation_required; map email_not_confirmed to 403

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
