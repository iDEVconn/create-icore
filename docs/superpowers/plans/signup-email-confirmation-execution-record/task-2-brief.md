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
