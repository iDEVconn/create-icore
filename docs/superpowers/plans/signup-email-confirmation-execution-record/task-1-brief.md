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
