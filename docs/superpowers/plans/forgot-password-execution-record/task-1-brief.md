### Task 1: Contract + Fake + contract-suite cases

**Files:**

- Modify: `libs/shared/src/strategies/auth.ts` (interface: 2 methods)
- Modify: `libs/shared/src/strategies/fakes/fake-auth.ts`
- Modify: `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts` (new helper + 4 cases)
- Modify: `libs/shared/src/strategies/__tests__/fake-auth.contract.unit.test.ts` (pass the helper)

**Interfaces:**

- Produces: `AuthStrategy.requestPasswordReset(email: string, callbackUrl: string): Promise<void>`; `AuthStrategy.confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession>` (throws `invalid_reset_token` for a bad/used token; ends all other sessions; returns a fresh session). `AuthContractHelpers.getPasswordResetToken?: (strategy: AuthStrategy, email: string) => string`. `FakeAuthStrategy.getLastPasswordResetToken(email: string): string`.

- [ ] **Step 1: Write the failing contract cases.** In `auth.contract.unit.test.ts` add to `AuthContractHelpers`:

```ts
  /**
   * Return the reset token that `requestPasswordReset` just emitted for `email`.
   * Optional — strategies without password reset (postgres/mongodb) omit it
   * and the reset cases skip.
   */
  getPasswordResetToken?: (strategy: AuthStrategy, email: string) => string;
```

and, next to the magic-link cases (inside `runAuthContract`), add:

```ts
if (helpers?.getPasswordResetToken) {
  const tokenFor = (email: string) => helpers.getPasswordResetToken!(strategy, email);

  it('requestPasswordReset + confirmPasswordReset sets the new password and returns a working session', async () => {
    const email = 'reset@x.com';
    await strategy.signUp(email, 'oldpw123!');
    await strategy.requestPasswordReset(email, 'http://localhost/reset-password');
    const session = await strategy.confirmPasswordReset(tokenFor(email), 'newpw123!');
    expect(session.user.email).toBe(email);
    await expect(strategy.verifyToken(session.accessToken)).resolves.toMatchObject({ email });
    await expect(strategy.signIn(email, 'newpw123!')).resolves.toBeTruthy();
    await expect(strategy.signIn(email, 'oldpw123!')).rejects.toThrow();
  });

  it('confirmPasswordReset rejects a bogus token', async () => {
    await expect(strategy.confirmPasswordReset('not-a-real-token', 'newpw123!')).rejects.toThrow();
  });

  it('a reset token is single-use', async () => {
    const email = 'reset-once@x.com';
    await strategy.signUp(email, 'oldpw123!');
    await strategy.requestPasswordReset(email, 'http://localhost/reset-password');
    const token = tokenFor(email);
    await strategy.confirmPasswordReset(token, 'newpw123!');
    await expect(strategy.confirmPasswordReset(token, 'another123!')).rejects.toThrow();
  });

  it("confirmPasswordReset ends the user's other sessions (old refresh token is dead)", async () => {
    const email = 'reset-sessions@x.com';
    const before = await strategy.signUp(email, 'oldpw123!');
    await strategy.requestPasswordReset(email, 'http://localhost/reset-password');
    const fresh = await strategy.confirmPasswordReset(tokenFor(email), 'newpw123!');
    await expect(strategy.refresh(before.refreshToken)).rejects.toThrow();
    // …and the session returned by the reset itself still works
    await expect(strategy.refresh(fresh.refreshToken)).resolves.toBeTruthy();
  });
}
```

In `fake-auth.contract.unit.test.ts` add `getPasswordResetToken: (s, email) => (s as FakeAuthStrategy).getLastPasswordResetToken(email),` to the helpers object it already passes (keep the existing `getMagicLinkToken`/OAuth ones).

- [ ] **Step 2: Run to verify it fails**

Run: `yarn nx test shared -- fake-auth.contract`
Expected: FAIL — `strategy.requestPasswordReset is not a function` / TS: property does not exist.

- [ ] **Step 3: Implement.** In `auth.ts` add to `AuthStrategy` (after `verifyMagicLink`):

```ts
  /**
   * Asks the provider to email a password-reset link that lands on `callbackUrl`.
   * Callers above the gateway must not learn whether the account exists, so a
   * provider may succeed silently for an unknown address.
   */
  requestPasswordReset(email: string, callbackUrl: string): Promise<void>;
  /**
   * Redeems a reset token, sets `newPassword`, ENDS EVERY OTHER SESSION of that
   * user at the provider, and returns a fresh session for the new password.
   * Rejects with `invalid_reset_token` for a bogus / expired / already-used token.
   */
  confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession>;
```

In `fake-auth.ts` add fields/methods:

```ts
  private readonly resetTokens = new Map<string, string>(); // token → uid
  private readonly resetTokenByEmail = new Map<string, string>();

  async requestPasswordReset(email: string, _callbackUrl: string): Promise<void> {
    const user = this.users.get(email);
    if (!user) return; // unknown address: silent, like a real provider
    const token = globalThis.crypto.randomUUID();
    this.resetTokens.set(token, user.id);
    this.resetTokenByEmail.set(email, token);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession> {
    const uid = this.resetTokens.get(token);
    if (!uid) throw new Error('invalid_reset_token');
    this.resetTokens.delete(token);
    const user = this.findById(uid);
    user.password = newPassword;
    for (const [refresh, owner] of this.refreshToUid) {
      if (owner === uid) this.refreshToUid.delete(refresh);
    }
    for (const [access, owner] of this.tokensToUid) {
      if (owner === uid) this.tokensToUid.delete(access);
    }
    return this.issueSession(user);
  }

  getLastPasswordResetToken(email: string): string {
    const token = this.resetTokenByEmail.get(email);
    if (!token) throw new Error(`no password reset issued for ${email}`);
    return token;
  }
```

- [ ] **Step 4: Run to verify it passes** — `yarn nx test shared`. Expected: PASS incl. the 4 new cases for the Fake. **Note:** other `AuthStrategy` implementers (Supabase/Firebase/Postgres/Mongo) will not compile until Tasks 2–3 — run only `shared` here.

- [ ] **Step 5: Commit**

```bash
npx prettier --write libs/shared/src/strategies
git add libs/shared/src/strategies
git commit -m "feat(shared): password-reset methods on AuthStrategy + Fake + contract cases"
```

---
