# Signup email-confirmation fix (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase signup with "Confirm email" enabled stops returning 500: the gateway answers 202 `confirmation_required`, the clients show the check-email screen, emails link to `CLIENT_ORIGIN`, and logging in before confirming gives a clear 403.

**Architecture:** `AuthStrategy.signUp` keeps returning `AuthSession`; a strategy that cannot issue a session yet throws the new typed `EmailConfirmationRequiredError({id,email})` (exported from `@icore/shared`). The auth MS catches it, still assigns the initial role, and returns `{status:'confirmation_required', user}`. The gateway maps that to HTTP 202. Sign-in before confirming throws `RpcException('email_not_confirmed')` → `ForbiddenException`.

**Tech Stack:** NestJS 11, Vitest, `@supabase/supabase-js`, React 19 (shadcn/antd/mui templates), `@icore/template-shared`, create-icore CLI.

**Spec:** `docs/superpowers/specs/2026-10-02-account-email-flows-design.md` (PR 1 section). **Deliberate deviation from the spec:** the spec's `SignUpResult` union return type is replaced by the typed error above, because the union would force edits to ~15 files/tests (contract suite, Fake, Firebase, Postgres, Mongo) for strategies that can never produce `confirmation_required`. Task 7 updates the spec to match.

## Global Constraints

- Branch `bug/signup-email-confirmation` (already cut from `dev`); PR base is **always** `--base dev`; never merge.
- Run `yarn`/`npx prettier --write <touched files>` before every commit; `yarn nx lint|test|build <project>` for touched projects; update docs; `.changeset/<slug>.md` (`'@idevconn/create-icore': patch`) is required.
- React 19: never `FormEvent`; use `SyntheticEvent<HTMLFormElement>`. One component per file. Never leave a `src/routes/**` file empty between edits.
- No `--no-verify`. After any `nx build create-icore`, `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json` before `git add` (build artifact drift).
- Existing tests that call `strategy.signUp(...)` / `controller.signup(...)` and read `.accessToken`/`.user` must keep compiling unchanged.
- New user-facing string: `auth.emailNotConfirmed` in en/ru/he in `libs/template-shared/src/lib/i18n/keys.ts`.

## Review Focus

- Supabase returns an obfuscated user (empty `identities`) and no error for an already-registered email when confirmation is on → treat as `confirmation_required` (no account enumeration); covered in Task 2.
- Admin emails (`ADMINS_LIST`) still get the `admin` role even though no session exists yet (Task 3).
- Unset `CLIENT_ORIGIN` must warn once, not silently emit localhost links (Task 4).
- Register with an already-signed-in session path (confirmation disabled) must still return `{user}` + cookies, not 202 (Task 4).
- Login of an unconfirmed user must be 403 `email_not_confirmed`, not 500/401 (Tasks 2+3+4).

---

### Task 1: Shared contract — `EmailConfirmationRequiredError` + Fake support

**Files:**

- Modify: `libs/shared/src/strategies/auth.ts` (add types/class, extend `signUp` signature)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Create: `libs/shared/src/strategies/__tests__/fake-auth.email-confirmation.unit.test.ts`

**Interfaces:**

- Produces (all exported from `@icore/shared`):
  `interface SignUpOptions { callbackUrl?: string }`
  `interface SignUpConfirmationRequired { status: 'confirmation_required'; user: { id: string; email: string } }`
  `class EmailConfirmationRequiredError extends Error { constructor(readonly user: { id: string; email: string }) }`
  `AuthStrategy.signUp(email: string, password: string, opts?: SignUpOptions): Promise<AuthSession>`
  `FakeAuthStrategy.requireEmailConfirmation: boolean` (public, default `false`) and `FakeAuthStrategy.confirmEmail(email: string): void`.

- [ ] **Step 1: Write the failing test** — `libs/shared/src/strategies/__tests__/fake-auth.email-confirmation.unit.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { EmailConfirmationRequiredError } from '../auth';
import { FakeAuthStrategy } from '../fakes/fake-auth';

describe('FakeAuthStrategy — email confirmation', () => {
  it('returns a session when confirmation is not required (default)', async () => {
    const s = new FakeAuthStrategy();
    const session = await s.signUp('a@x.com', 'pw12345!');
    expect(session.user.email).toBe('a@x.com');
  });

  it('signUp throws EmailConfirmationRequiredError carrying the new user', async () => {
    const s = new FakeAuthStrategy();
    s.requireEmailConfirmation = true;
    const err = await s.signUp('b@x.com', 'pw12345!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    const user = (err as EmailConfirmationRequiredError).user;
    expect(user.email).toBe('b@x.com');
    expect(user.id).toBeTruthy();
  });

  it('signIn rejects with email_not_confirmed until confirmEmail()', async () => {
    const s = new FakeAuthStrategy();
    s.requireEmailConfirmation = true;
    await s.signUp('c@x.com', 'pw12345!').catch(() => undefined);
    await expect(s.signIn('c@x.com', 'pw12345!')).rejects.toThrow('email_not_confirmed');
    s.confirmEmail('c@x.com');
    const session = await s.signIn('c@x.com', 'pw12345!');
    expect(session.user.email).toBe('c@x.com');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test shared --testFile=fake-auth.email-confirmation`
Expected: FAIL (`EmailConfirmationRequiredError` is not exported / `requireEmailConfirmation` does not exist).

- [ ] **Step 3: Implement** — in `libs/shared/src/strategies/auth.ts` add after `OAuthStartResult`:

```ts
export interface SignUpOptions {
  /** Where the provider's confirmation email should send the user back to. */
  callbackUrl?: string;
}

/** Returned by the auth MS `auth.signup` when the user exists but has no session yet. */
export interface SignUpConfirmationRequired {
  status: 'confirmation_required';
  user: { id: string; email: string };
}

/**
 * Thrown by `AuthStrategy.signUp` when the account was created but the provider
 * requires the user to confirm their email before a session can be issued
 * (e.g. Supabase "Confirm email"). Not a failure — the auth MS turns it into
 * `SignUpConfirmationRequired`.
 */
export class EmailConfirmationRequiredError extends Error {
  constructor(readonly user: { id: string; email: string }) {
    super('email_confirmation_required');
    this.name = 'EmailConfirmationRequiredError';
  }
}
```

and change the interface line `signUp(email: string, password: string): Promise<AuthSession>;` to:

```ts
  /** May throw `EmailConfirmationRequiredError` instead of returning a session. */
  signUp(email: string, password: string, opts?: SignUpOptions): Promise<AuthSession>;
```

In `libs/shared/src/strategies/fakes/fake-auth.ts`: add `import { EmailConfirmationRequiredError } from '../auth';` (keep the existing `import type {...}`), then replace `signUp`/`signIn` and add the field + method:

```ts
  requireEmailConfirmation = false;
  private readonly unconfirmed = new Set<string>();

  confirmEmail(email: string): void {
    this.unconfirmed.delete(email);
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    if (this.users.has(email)) throw new Error('user_exists');
    const user: StoredUser = { id: globalThis.crypto.randomUUID(), email, password };
    this.users.set(email, user);
    if (this.requireEmailConfirmation) {
      this.unconfirmed.add(email);
      throw new EmailConfirmationRequiredError({ id: user.id, email });
    }
    return this.issueSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.get(email);
    if (!user || user.password !== password) throw new Error('invalid_credentials');
    if (this.unconfirmed.has(email)) throw new Error('email_not_confirmed');
    return this.issueSession(user);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `yarn nx test shared` — Expected: PASS (new tests + all existing contract tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/shared/src/strategies/auth.ts libs/shared/src/strategies/fakes/fake-auth.ts libs/shared/src/strategies/__tests__/fake-auth.email-confirmation.unit.test.ts
git add libs/shared/src/strategies
git commit -m "feat(shared): EmailConfirmationRequiredError + SignUpOptions in AuthStrategy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Supabase strategy — confirmation-required signup, redirect URL, unconfirmed sign-in

**Files:**

- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts` (`signUp`, `signIn`, imports)
- Modify: `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts`
- Modify (append): `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`

**Interfaces:**

- Consumes: `EmailConfirmationRequiredError`, `SignUpOptions` from `@icore/shared` (Task 1).
- Produces: `createMockSupabaseClient(opts?: { requireEmailConfirmation?: boolean })`; `MockSupabaseClient.confirmEmail(email: string): void`; `MockSupabaseClient.getLastSignUpOptions(): { emailRedirectTo?: string } | undefined`.

- [ ] **Step 1: Write the failing tests** — append to `supabase-auth.strategy.unit.test.ts` (add `import { EmailConfirmationRequiredError } from '@icore/shared';` at the top):

```ts
describe('SupabaseAuthStrategy — signUp() with email confirmation', () => {
  it('throws EmailConfirmationRequiredError (not a generic Error) when GoTrue returns a user but no session', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    const err = await strategy.signUp('a@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    expect((err as EmailConfirmationRequiredError).user.email).toBe('a@x.com');
    expect((err as EmailConfirmationRequiredError).user.id).toBeTruthy();
  });

  it('passes callbackUrl to GoTrue as emailRedirectTo', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    await strategy
      .signUp('b@x.com', 'pw12345!', { callbackUrl: 'https://my.app/auth/callback' })
      .catch(() => undefined);

    expect(mock.getLastSignUpOptions()).toEqual({
      emailRedirectTo: 'https://my.app/auth/callback',
    });
  });

  it('still returns a session when confirmation is disabled', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    const session = await strategy.signUp('c@x.com', 'pw12345!');
    expect(session.user.email).toBe('c@x.com');
  });

  it('real provider errors (e.g. user exists) still throw a plain Error', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('d@x.com', 'pw12345!');
    const err = await strategy.signUp('d@x.com', 'pw12345!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EmailConfirmationRequiredError);
  });
});

describe('SupabaseAuthStrategy — signIn() before email confirmation', () => {
  it("throws RpcException('email_not_confirmed') so it survives the RPC boundary", async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('e@x.com', 'pw12345!').catch(() => undefined);

    const err = await strategy.signIn('e@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('email_not_confirmed');
  });

  it('signs in normally once the email is confirmed', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('f@x.com', 'pw12345!').catch(() => undefined);
    mock.confirmEmail('f@x.com');
    const session = await strategy.signIn('f@x.com', 'pw12345!');
    expect(session.user.email).toBe('f@x.com');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test auth-supabase`
Expected: FAIL (mock has no `requireEmailConfirmation` option / `confirmEmail` / `getLastSignUpOptions`; strategy throws plain `Error`).

- [ ] **Step 3: Implement the mock** — in `mock-supabase.ts`:

Change the interface and factory signature:

```ts
export interface MockSupabaseClient {
  client: SupabaseClient;
  getMagicLinkToken(email: string): string;
  getOAuthChallenge(provider: 'google' | 'github', email: string): { code: string; state: string };
  confirmEmail(email: string): void;
  getLastSignUpOptions(): { emailRedirectTo?: string } | undefined;
}

export function createMockSupabaseClient(
  opts: { requireEmailConfirmation?: boolean } = {},
): MockSupabaseClient {
```

Add next to the other `const` maps at the top of the factory body:

```ts
const unconfirmedEmails = new Set<string>();
let lastSignUpOptions: { emailRedirectTo?: string } | undefined;
```

Replace `auth.signUp` and `auth.signInWithPassword`:

```ts
    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { emailRedirectTo?: string };
    }) {
      lastSignUpOptions = options;
      for (const u of users.values()) {
        if (u.email === email) {
          return { data: { user: null, session: null }, error: { message: 'user exists' } };
        }
      }
      const user: FakeUser = { id: `uid_${users.size + 1}`, email, password };
      users.set(user.id, user);
      if (opts.requireEmailConfirmation) {
        unconfirmedEmails.add(email);
        return { data: { user: { id: user.id, email }, session: null }, error: null };
      }
      const session = issueSession(user);
      return { data: { user: session.user, session }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      for (const u of users.values()) {
        if (u.email === email && u.password === password) {
          if (unconfirmedEmails.has(email)) {
            return {
              data: { user: null, session: null },
              error: {
                name: 'AuthApiError',
                message: 'Email not confirmed',
                status: 400,
                code: 'email_not_confirmed',
              },
            };
          }
          const session = issueSession(u);
          return { data: { user: session.user, session }, error: null };
        }
      }
      return { data: { user: null, session: null }, error: { message: 'invalid credentials' } };
    },
```

And in the object the factory returns (find the `return { client: ..., getMagicLinkToken ..., getOAuthChallenge ... }` block at the bottom of the file) add:

```ts
    confirmEmail(email: string) {
      unconfirmedEmails.delete(email);
    },
    getLastSignUpOptions() {
      return lastSignUpOptions;
    },
```

- [ ] **Step 4: Implement the strategy** — in `supabase-auth.strategy.ts` change the `@icore/shared` import to also pull the values/types:

```ts
import { EmailConfirmationRequiredError } from '@icore/shared';
import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  SignUpOptions,
  VerifiedToken,
} from '@icore/shared';
```

Replace `signUp` and `signIn`:

```ts
  async signUp(email: string, password: string, opts?: SignUpOptions): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: opts?.callbackUrl ? { emailRedirectTo: opts.callbackUrl } : undefined,
    });
    if (error) throw new Error(error.message);
    if (!data.session) {
      // "Confirm email" is on: GoTrue created the user (or, for an already
      // registered address, returns an obfuscated user — deliberately NOT an
      // error, so signup can't be used to enumerate accounts) and mailed a
      // link. That's a normal outcome, not a failure.
      if (data.user) {
        throw new EmailConfirmationRequiredError({
          id: data.user.id,
          email: data.user.email ?? email,
        });
      }
      throw new Error('signup_failed');
    }
    return this.toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      // RpcException (not a plain Error) so the code survives the MS transport
      // and the gateway can answer 403 instead of a scrubbed 500.
      if ((error as { code?: string } | null)?.code === 'email_not_confirmed') {
        throw new RpcException('email_not_confirmed');
      }
      throw new Error(error?.message ?? 'invalid_credentials');
    }
    return this.toSession(data.session);
  }
```

- [ ] **Step 5: Run to verify it passes**

Run: `yarn nx test auth-supabase` — Expected: PASS (including existing contract test).

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts
git add libs/auth-strategies/supabase
git commit -m "fix(auth-supabase): signup with email confirmation is not an error

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

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

### Task 4: Gateway — 202 on register, shared `clientOrigin()` with warning

**Files:**

- Modify: `apps/api/src/app/auth/auth.controller.ts` (`register`, `requestMagicLink`, new private helper, imports)
- Modify (append + small helper edit): `apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts`

**Interfaces:**

- Consumes: `AuthClientService.signup(email, password, callbackUrl?)` (Task 3).
- Produces: `POST /auth/register` → `201 {user}` + cookies, or `202 {status:'confirmation_required', email}` and no cookies.

- [ ] **Step 1: Write the failing tests.** In the test file add `status: vi.fn(() => res),` to the object built in `mockRes()` (next to `redirect`) and add `HttpStatus` import from `@nestjs/common`; then append:

```ts
describe('AuthController — register', () => {
  let sessionStore: FakeSessionStore;
  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('answers 202 confirmation_required, sets no cookies and creates no session', async () => {
    const client = makeAuthClient();
    (client.signup as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'confirmation_required',
      user: { id: 'u1', email: 'a@x.com' },
    });
    const controller = new AuthController(
      client,
      makeConfig({ CLIENT_ORIGIN: 'https://my.app' }),
      sessionStore,
    );
    const res = mockRes();

    const result = await controller.register({ email: 'a@x.com', password: 'pw12345!' }, res);

    expect(result).toEqual({ status: 'confirmation_required', email: 'a@x.com' });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
    expect(res.cookies['icore_sid']).toBeUndefined();
    expect(client.signup).toHaveBeenCalledWith(
      'a@x.com',
      'pw12345!',
      'https://my.app/auth/callback',
    );
  });

  it('still starts a session and returns { user } when the provider issued one', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();

    const result = await controller.register({ email: 'a@x.com', password: 'pw12345!' }, res);

    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.cookies['icore_sid']).toBeTruthy();
  });

  it('warns once when CLIENT_ORIGIN is unset and falls back to localhost:4200', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);

    await controller.register({ email: 'a@x.com', password: 'pw12345!' }, mockRes());
    await controller.requestMagicLink({ email: 'a@x.com' });

    expect(client.signup).toHaveBeenCalledWith(
      'a@x.com',
      'pw12345!',
      'http://localhost:4200/auth/callback',
    );
    expect(warn.mock.calls.filter(([m]) => String(m).includes('CLIENT_ORIGIN'))).toHaveLength(1);
    warn.mockRestore();
  });
});
```

(add `Logger` to the `@nestjs/common` import in the test: `import { HttpStatus, Logger, UnauthorizedException } from '@nestjs/common';`)

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test api --testFile=auth.controller.unit`
Expected: FAIL (register returns a session for every result; no `clientOrigin()` warning).

- [ ] **Step 3: Implement** — in `apps/api/src/app/auth/auth.controller.ts` add `HttpStatus` to the `@nestjs/common` import list, add the field + helper next to the other private methods, and replace `register` and `requestMagicLink`:

```ts
  private warnedMissingClientOrigin = false;

  /** Where provider emails (confirm / magic-link) send the user back to. */
  private clientOrigin(): string {
    const origin = this.cfg.get<string>('CLIENT_ORIGIN');
    if (origin) return origin;
    if (!this.warnedMissingClientOrigin) {
      this.warnedMissingClientOrigin = true;
      this.logger.warn(
        'CLIENT_ORIGIN is not set — emails will link to http://localhost:4200. Set it to your client URL (and the same value as Site URL in Supabase → Authentication → URL Configuration).',
      );
    }
    return 'http://localhost:4200';
  }
```

```ts
  async register(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authClient.signup(
      body.email,
      body.password,
      `${this.clientOrigin()}/auth/callback`,
    );
    if ('status' in result) {
      // Account created, but the provider wants the email confirmed first —
      // no session exists, so no cookies.
      res.status(HttpStatus.ACCEPTED);
      return { status: 'confirmation_required' as const, email: result.user.email };
    }
    return this.startSession(result, res, await this.resolveRole(result.accessToken));
  }
```

```ts
  requestMagicLink(@Body() body: { email: string }) {
    return this.authClient.sendMagicLink(body.email, `${this.clientOrigin()}/auth/callback`);
  }
```

Also update the `@ApiOperation` summary of `register` to `'Create a new user (201 + session, or 202 when email confirmation is required)'`.

- [ ] **Step 4: Run to verify it passes**

Run: `yarn nx test api` — Expected: PASS (existing magic-link tests unchanged).

- [ ] **Step 5: Commit**

```bash
npx prettier --write apps/api/src/app/auth/auth.controller.ts apps/api/src/app/auth/__tests__/auth.controller.unit.test.ts
git add apps/api/src/app/auth
git commit -m "fix(api): register answers 202 confirmation_required instead of 500; warn on missing CLIENT_ORIGIN

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Clients — shared response helper, three RegisterForms/login routes, 403 message, i18n

**Files:**

- Create: `libs/template-shared/src/lib/auth/register-response.ts`
- Create: `libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts`
- Modify: `libs/template-shared/src/index.ts` (export line)
- Modify: `libs/template-shared/src/lib/i18n/keys.ts` (`auth.emailNotConfirmed` en/ru/he)
- Modify: `apps/templates/client-shadcn/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`, `.../routes/login.tsx`
- Modify: `apps/templates/client-antd/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`
- Modify: `apps/templates/client-mui/src/components/auth/RegisterForm.tsx`, `.../LoginForm.tsx`
- Create: `apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx`

**Interfaces:**

- Produces: `type RegisterResponse = { status: 'confirmation_required'; email: string } | { user: { id: string; email: string; role?: string } }`; `isConfirmationRequired(res: RegisterResponse): res is { status: 'confirmation_required'; email: string }` from `@icore/template-shared`.
- Behaviour: `confirmation_required` → existing `onSuccess(email)` (check-email screen); session → sign-in handling identical to a login success (store user, success toast, navigate `/dashboard`); login 403 → `t('auth.emailNotConfirmed')`.

- [ ] **Step 1: Write the failing helper test** — `libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isConfirmationRequired, type RegisterResponse } from '../register-response';

describe('isConfirmationRequired', () => {
  it('is true for the 202 confirmation payload', () => {
    const res: RegisterResponse = { status: 'confirmation_required', email: 'a@x.com' };
    expect(isConfirmationRequired(res)).toBe(true);
  });

  it('is false for a started session ({ user })', () => {
    const res: RegisterResponse = { user: { id: 'u1', email: 'a@x.com' } };
    expect(isConfirmationRequired(res)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test template-shared --testFile=register-response` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `libs/template-shared/src/lib/auth/register-response.ts`:

```ts
/** Body of `POST /auth/register`: 202 when the provider wants the email confirmed first, 201 `{ user }` otherwise. */
export type RegisterResponse =
  | { status: 'confirmation_required'; email: string }
  | { user: { id: string; email: string; role?: string } };

export function isConfirmationRequired(
  res: RegisterResponse,
): res is { status: 'confirmation_required'; email: string } {
  return 'status' in res && res.status === 'confirmation_required';
}
```

Add `export * from './lib/auth/register-response.js';` to `libs/template-shared/src/index.ts`. In `keys.ts` add, next to each language's `checkEmail`-area keys under `auth`: en `emailNotConfirmed: 'Please confirm your email first — check your inbox for the link.'`, ru `emailNotConfirmed: 'Сначала подтвердите email — ссылка в письме.'`, he `emailNotConfirmed: 'יש לאשר את האימייל תחילה — הקישור נמצא בתיבת הדואר.'`.

Run: `yarn nx test template-shared` — Expected: PASS.

- [ ] **Step 4: shadcn — failing component test** `apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '../RegisterForm';

function setup(apiResult: unknown) {
  const onSuccess = vi.fn();
  const onSignedIn = vi.fn();
  render(
    <RegisterForm
      api={(async () => apiResult) as never}
      onSuccess={onSuccess}
      onSignedIn={onSignedIn}
      onError={vi.fn()}
      onSwitchToLogin={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'a@x.com' } });
  fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'pw12345!' } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
    target: { value: 'pw12345!' },
  });
  fireEvent.submit(screen.getByLabelText('auth.email').closest('form') as HTMLFormElement);
  return { onSuccess, onSignedIn };
}

describe('RegisterForm — register response handling', () => {
  it('shows the check-email flow on 202 confirmation_required', async () => {
    const { onSuccess, onSignedIn } = setup({ status: 'confirmation_required', email: 'a@x.com' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('a@x.com'));
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('signs the user in when a session was started', async () => {
    const session = { user: { id: 'u1', email: 'a@x.com', role: 'user' } };
    const { onSuccess, onSignedIn } = setup(session);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
```

Run: `yarn nx test client-shadcn --testFile=RegisterForm` — Expected: FAIL (`onSignedIn` prop does not exist; always calls `onSuccess`).

- [ ] **Step 5: shadcn implementation.** `RegisterForm.tsx`: extend props and handler.

```tsx
import { isConfirmationRequired, type RegisterResponse } from '@icore/template-shared';

interface RegisterFormProps {
  onSuccess: (email: string) => void;
  onSignedIn: (session: { user: { id: string; email: string; role?: string } }) => void;
  onError: (msg: string) => void;
  onSwitchToLogin: () => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}
export function RegisterForm({ onSuccess, onSignedIn, onError, onSwitchToLogin, api }: RegisterFormProps) {
```

and in `handleSubmit` replace the `await api(...)` + `onSuccess(email)` pair with:

```tsx
const res = await api<RegisterResponse>('/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (isConfirmationRequired(res)) onSuccess(res.email);
else onSignedIn(res);
```

`routes/login.tsx`: pass `onSignedIn={handleLoginSuccess}` to `<RegisterForm …>`. `LoginForm.tsx` (shadcn): import `ApiError` from `@icore/template-shared` (verify it is re-exported: `libs/template-shared/src/lib/api/create-api.ts:49`) and change the catch to:

```tsx
    } catch (err) {
      onError(
        err instanceof ApiError && err.status === 403
          ? t('auth.emailNotConfirmed')
          : err instanceof Error
            ? err.message
            : t('error.unknown'),
      );
```

- [ ] **Step 6: antd + mui.** Their forms use hooks directly (see their `LoginForm.tsx`: `useNavigate`, `useNotify`, `useAuthStore`). In each `RegisterForm.tsx` add the same hooks and replace the `await api('/auth/register'…)` + `onSuccess(…)` pair:

```tsx
const navigate = useNavigate();
const notify = useNotify();
const setUser = useAuthStore((s) => s.setUser);
// …inside the submit handler:
const res = await api<RegisterResponse>('/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (isConfirmationRequired(res)) {
  onSuccess(res.email);
} else {
  setUser(res.user);
  notify.success(t('auth.login'));
  await navigate({ to: '/dashboard' });
}
```

(antd uses `values.email`/`values.password` from its Form `onFinish` — keep those variable names; imports: `import { isConfirmationRequired, useAuthStore, useNotify, type RegisterResponse } from '@icore/template-shared';` and `import { useNavigate } from '@tanstack/react-router';`.) In each `LoginForm.tsx` catch, replace `notify.error(err instanceof Error ? err.message : t('error.unknown'))` with:

```tsx
notify.error(
  err instanceof ApiError && err.status === 403
    ? t('auth.emailNotConfirmed')
    : err instanceof Error
      ? err.message
      : t('error.unknown'),
);
```

adding `ApiError` to the `@icore/template-shared` import.

- [ ] **Step 7: Verify**

Run: `yarn nx test client-shadcn && yarn nx test client-antd && yarn nx test client-mui && yarn nx lint client-shadcn client-antd client-mui && yarn nx run-many -t build -p client-shadcn client-antd client-mui` (client builds use target `vite:build`: `yarn nx run client-shadcn:vite:build` etc. if `build` is missing) — Expected: all PASS/green. Then `node tools/create-icore/scripts/check-route-integrity.mjs`.

- [ ] **Step 8: Commit**

```bash
npx prettier --write $(git diff --name-only -- apps/templates libs/template-shared) libs/template-shared/src/lib/auth/register-response.ts libs/template-shared/src/lib/auth/__tests__/register-response.unit.test.ts apps/templates/client-shadcn/src/components/auth/__tests__/RegisterForm.spec.tsx
git add apps/templates libs/template-shared
git commit -m "fix(clients): register confirmation_required shows check-email; session signs in; 403 unconfirmed message

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Runbook + CLI notice + generated README

**Files:**

- Create: `docs/runbooks/auth-email-setup.md`
- Create: `tools/create-icore/src/lib/auth-email-notice.ts`
- Create: `tools/create-icore/src/lib/__tests__/auth-email-notice.unit.test.ts`
- Modify: `tools/create-icore/src/cli.ts` (print notice after the "Next:" block)
- Modify: `tools/create-icore/src/lib/scaffold-pkg.ts` (README section)

**Interfaces:**

- Produces: `authEmailNotice(authProvider: CreateIcoreOptions['authProvider']): string[]` — `[]` for `none|postgres|mongodb`, lines for `supabase|firebase`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { authEmailNotice } from '../auth-email-notice.js';

describe('authEmailNotice', () => {
  it('tells Supabase users to set Site URL + Redirect URLs (emails default to localhost:3000)', () => {
    const text = authEmailNotice('supabase').join('\n');
    expect(text).toContain('Authentication → URL Configuration');
    expect(text).toContain('Site URL');
    expect(text).toContain('localhost:3000');
    expect(text).toContain('/auth/callback');
  });

  it('tells Firebase users to authorize their client domain', () => {
    expect(authEmailNotice('firebase').join('\n')).toContain('Authorized domains');
  });

  it.each(['none', 'postgres', 'mongodb'] as const)(
    'is empty for %s (no provider-sent emails)',
    (p) => {
      expect(authEmailNotice(p)).toEqual([]);
    },
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test create-icore --testFile=auth-email-notice` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `tools/create-icore/src/lib/auth-email-notice.ts`:

```ts
import type { CreateIcoreOptions } from './options.js';

/**
 * Provider-side setup the generated project cannot do for you. Without it,
 * confirmation / magic-link emails link to the provider's default URL
 * (Supabase: http://localhost:3000) instead of your client.
 */
export function authEmailNotice(authProvider: CreateIcoreOptions['authProvider']): string[] {
  if (authProvider === 'supabase') {
    return [
      'Supabase email links: open your project → Authentication → URL Configuration and set',
      '  • Site URL = your client URL (CLIENT_ORIGIN in apps/api/.env). The default is http://localhost:3000,',
      '    so confirmation emails would otherwise point there.',
      '  • Redirect URLs = <CLIENT_ORIGIN>/auth/callback',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  if (authProvider === 'firebase') {
    return [
      'Firebase email links: Authentication → Settings → Authorized domains — add your client domain.',
      'Details: docs/runbooks/auth-email-setup.md',
    ];
  }
  return [];
}
```

In `cli.ts` import it and, right after the existing `p.log.info('Next:')` block's last line (find the last `p.log.info(...)` of that block), add:

```ts
const emailNotice = authEmailNotice(opts.authProvider);
if (emailNotice.length > 0) {
  p.log.warn('One-time provider setup:');
  for (const line of emailNotice) p.log.info(line);
}
```

In `scaffold-pkg.ts`, import `authEmailNotice` and insert into the README template after the "Quick start" code block (before `## Commands`):

```ts
${authEmailNotice(opts.authProvider).length > 0 ? `## Provider setup (email links)\n\n${authEmailNotice(opts.authProvider).join('\n')}\n\n` : ''}
```

(match the surrounding template-literal escaping — this block lives inside a backtick string, so no nested backticks are used.)

- [ ] **Step 4: Write `docs/runbooks/auth-email-setup.md`** with: why (default Site URL `http://localhost:3000`, signup returns 202 `confirmation_required` when "Confirm email" is on and the clients show the check-email screen), the Supabase steps (Site URL = `CLIENT_ORIGIN`; Redirect URLs `<origin>/auth/callback`; note that signup-confirmation and magic-link templates keep working with the default `{{ .ConfirmationURL }}` because `/auth/callback` also handles the hash-session shape), the Firebase step (Authorized domains), `CLIENT_ORIGIN` (gateway env, default `http://localhost:4200`, warns when unset), the 403 `email_not_confirmed` login behaviour, and a "Coming in the forgot-password PR" line (recovery template `{{ .TokenHash }}`, Firebase action URL). Keep it under ~60 lines.

- [ ] **Step 5: Verify + commit**

Run: `yarn nx test create-icore && yarn nx lint create-icore && yarn nx build create-icore`; then `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`.

```bash
npx prettier --write tools/create-icore/src/cli.ts tools/create-icore/src/lib/scaffold-pkg.ts tools/create-icore/src/lib/auth-email-notice.ts tools/create-icore/src/lib/__tests__/auth-email-notice.unit.test.ts docs/runbooks/auth-email-setup.md
git add tools/create-icore/src docs/runbooks/auth-email-setup.md
git commit -m "docs(create-icore): one-time Supabase/Firebase email-link setup notice + runbook

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Spec sync, docs, changeset, full verification, PR

**Files:**

- Modify: `docs/superpowers/specs/2026-10-02-account-email-flows-design.md` (contract section: replace the `SignUpResult` union with `EmailConfirmationRequiredError` + `SignUpConfirmationRequired`, note the reason)
- Modify: `docs/architecture.md`, `AGENTS.md` (one bullet: signup may be `confirmation_required`/202; `CLIENT_ORIGIN` drives email links; link the runbook)
- Create: `.changeset/signup-email-confirmation.md`

- [ ] **Step 1:** Edit the spec and docs as above. Changeset:

```md
---
'@idevconn/create-icore': patch
---

Signup with Supabase "Confirm email" no longer 500s: gateway answers 202 confirmation_required, clients show the check-email screen, emails link to CLIENT_ORIGIN, unconfirmed login is a clear 403; CLI prints the Supabase/Firebase URL setup notice
```

- [ ] **Step 2: Full verification** — `yarn nx affected -t lint test build` (or `yarn nx run-many -t lint test -p shared auth-supabase auth auth-client api template-shared client-shadcn client-antd client-mui create-icore`), `node tools/create-icore/scripts/check-route-integrity.mjs`, `git status` (discard `templates/`/`registry.json` drift), confirm `git branch --show-current` = `bug/signup-email-confirmation`.

- [ ] **Step 3: Commit, push, PR**

```bash
npx prettier --write docs/superpowers/specs/2026-10-02-account-email-flows-design.md docs/architecture.md AGENTS.md .changeset/signup-email-confirmation.md
git add docs AGENTS.md .changeset/signup-email-confirmation.md
git commit -m "docs: signup email confirmation — spec sync, architecture, changeset

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
gh pr list --state all --limit 10
git push -u origin bug/signup-email-confirmation
gh pr create --base dev --title "fix: signup email confirmation (202), CLIENT_ORIGIN email links, unconfirmed login 403" --body "<what/why/test plan; end with the Claude Code attribution line>"
```

Report CI result + PR link. **Do not merge.**
