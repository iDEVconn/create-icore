### Task 2: Supabase strategy + mock

**Files:**

- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts` (pass the helper)
- Modify (append): `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`

**Interfaces:**

- Consumes: `AuthStrategy` reset methods, `AuthContractHelpers.getPasswordResetToken` (Task 1).
- Produces: `MockSupabaseClient.getPasswordResetToken(email: string): string`; `MockSupabaseClient.getLastResetRedirect(): string | undefined`.

- [ ] **Step 1: Write the failing tests.** In `supabase-auth.contract.unit.test.ts` add to the helpers: `getPasswordResetToken: (s, email) => mock.getPasswordResetToken(email)` (use the same `mock` instance the factory creates — follow how `getMagicLinkToken` is wired in that file). Append to `supabase-auth.strategy.unit.test.ts`:

```ts
describe('SupabaseAuthStrategy — password reset', () => {
  it('requestPasswordReset passes callbackUrl as redirectTo', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    expect(mock.getLastResetRedirect()).toBe('https://my.app/reset-password');
  });

  it('requestPasswordReset for an unknown email resolves without throwing (no enumeration)', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await expect(
      strategy.requestPasswordReset('nobody@x.com', 'https://my.app/r'),
    ).resolves.toBeUndefined();
  });

  it("confirmPasswordReset rejects a bogus token with RpcException('invalid_reset_token')", async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    const err = await strategy.confirmPasswordReset('nope', 'newpw123!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('invalid_reset_token');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `yarn nx test auth-supabase`. Expected: FAIL (methods/mock helpers missing; TS errors for the new interface methods).

- [ ] **Step 3: Implement the mock.** In `mock-supabase.ts`: add to the interface `getPasswordResetToken(email: string): string; getLastResetRedirect(): string | undefined;`; add state `const recoveryTokenToUid = new Map<string, string>(); const recoveryTokenByEmail = new Map<string, string>(); let lastResetRedirect: string | undefined;`. Extend `auth`:

```ts
    async resetPasswordForEmail(
      email: string,
      options?: { redirectTo?: string },
    ) {
      lastResetRedirect = options?.redirectTo;
      const user = [...users.values()].find((u) => u.email === email);
      if (!user) return { data: {}, error: null }; // GoTrue answers success for unknown emails
      const tokenHash = `rec_${user.id}_${recoveryTokenToUid.size}_${Math.random()}`;
      recoveryTokenToUid.set(tokenHash, user.id);
      recoveryTokenByEmail.set(email, tokenHash);
      return { data: {}, error: null };
    },
```

and change `verifyOtp` to accept both types:

```ts
    async verifyOtp({ type, token_hash }: { type: 'magiclink' | 'recovery'; token_hash: string }) {
      const bucket = type === 'recovery' ? recoveryTokenToUid : type === 'magiclink' ? magicTokenToUid : null;
      if (!bucket) {
        return { data: { user: null, session: null }, error: { message: 'unsupported type' } };
      }
      const uid = bucket.get(token_hash);
      if (!uid) return { data: { user: null, session: null }, error: { message: 'invalid otp' } };
      bucket.delete(token_hash);
      const user = findById(uid);
      if (!user) return { data: { user: null, session: null }, error: { message: 'user missing' } };
      const session = issueSession(user);
      return { data: { user: session.user, session }, error: null };
    },
```

Extend `admin.updateUserById(uid, updates: { app_metadata?: { role?: string }; password?: string })` to also `if (typeof updates.password === 'string') user.password = updates.password;`, and make `admin.signOut(jwt, scope)` honour `'global'`:

```ts
    async signOut(jwt: string, scope?: 'global' | 'local' | 'others') {
      const sessionId = accessToSessionId.get(jwt);
      if (scope === 'global') {
        const uid = accessToUid.get(jwt);
        for (const [access, owner] of accessToUid) {
          if (owner !== uid) continue;
          const sid = accessToSessionId.get(access);
          if (sid) revokedSessionIds.add(sid);
        }
      } else if (sessionId) {
        revokedSessionIds.add(sessionId);
      }
      return { error: null };
    },
```

and expose the two helpers in the returned object: `getPasswordResetToken(email) { const t = recoveryTokenByEmail.get(email); if (!t) throw new Error(\`no password reset issued for ${email}\`); return t; }`, `getLastResetRedirect() { return lastResetRedirect; }`. (Check that the mock's `refreshSession`already refuses a refresh token whose session id is in`revokedSessionIds`; if not, add that check — the contract case "old refresh token is dead" depends on it.)

- [ ] **Step 4: Implement the strategy.** In `supabase-auth.strategy.ts`:

```ts
  async requestPasswordReset(email: string, callbackUrl: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl,
    });
    if (error) throw new Error(error.message);
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.verifyOtp({
      type: 'recovery',
      token_hash: token,
    });
    const email = data?.user?.email;
    if (error || !data?.session || !data.user || !email) {
      throw new RpcException('invalid_reset_token');
    }
    const { error: updateError } = await this.client.auth.admin.updateUserById(data.user.id, {
      password: newPassword,
    });
    if (updateError) throw new Error(updateError.message);
    // End every session (including the recovery one) BEFORE minting the new
    // one — the gateway never revokes at the provider (see plan ruling 1).
    await this.client.auth.admin.signOut(data.session.access_token, 'global');
    return this.signIn(email, newPassword);
  }
```

- [ ] **Step 5: Run to verify it passes** — `yarn nx test auth-supabase`. Expected: PASS (contract cases + the 3 new tests + all existing).

- [ ] **Step 6: Commit**

```bash
npx prettier --write libs/auth-strategies/supabase/src
git add libs/auth-strategies/supabase
git commit -m "feat(auth-supabase): password reset via recovery OTP, global sign-out before new session"
```

---
