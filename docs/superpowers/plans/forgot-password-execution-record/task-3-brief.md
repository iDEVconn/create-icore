### Task 3: Firebase strategy + mocks; Postgres/Mongo stubs

**Files:**

- Modify: `libs/auth-strategies/firebase/src/lib/identity-toolkit.client.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts` (admin interface + 2 methods)
- Modify: `libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts`, `testing/mock-admin-auth.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts` (pass the helper)
- Modify (append): `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts`
- Modify: `libs/auth-strategies/postgres/src/lib/postgres-auth.strategy.ts`, `libs/auth-strategies/mongodb/src/lib/mongodb-auth.strategy.ts` (stubs)

**Interfaces:**

- Consumes: Task 1 contract.
- Produces: `IdentityToolkitClient.sendPasswordResetEmail(opts: { email: string; continueUrl: string }): Promise<void>`; `IdentityToolkitClient.confirmPasswordReset(opts: { oobCode: string; newPassword: string }): Promise<{ email: string }>`; `FirebaseAdminAuthLike.getUserByEmail(email: string): Promise<{ uid: string }>`; `MockHandle.getResetCode(email: string): string`; `MockHandle.revokeUser(uid: string): void`.

- [ ] **Step 1: Write the failing tests.** In `firebase-auth.contract.unit.test.ts` add `getPasswordResetToken: (_s, email) => mock.getResetCode(email)` to the helpers (mirror how `getMagicLinkToken` uses `mock.getOobCode`). Append to `firebase-auth.strategy.unit.test.ts` (reuse that file's existing fixture helper for building `{strategy, mock}`; read the file's top first):

```ts
describe('FirebaseAuthStrategy — password reset', () => {
  it('requestPasswordReset sends a PASSWORD_RESET email for a known user', async () => {
    const { strategy, mock } = fixture();
    await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    expect(mock.getResetCode('a@x.com')).toBeTruthy();
  });

  it("confirmPasswordReset maps a bad oobCode to RpcException('invalid_reset_token')", async () => {
    const { strategy } = fixture();
    const err = await strategy.confirmPasswordReset('bogus', 'newpw123!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('invalid_reset_token');
  });

  it('revokes every refresh token issued BEFORE the reset but not the one it returns', async () => {
    const { strategy, mock } = fixture();
    const before = await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    const fresh = await strategy.confirmPasswordReset(mock.getResetCode('a@x.com'), 'newpw123!');
    await expect(strategy.refresh(before.refreshToken)).rejects.toThrow();
    await expect(strategy.refresh(fresh.refreshToken)).resolves.toBeTruthy();
  });
});
```

(`fixture()` = whatever the existing file uses; if none exists, build `createMockIdentityToolkit()` + `createMockAdminAuth({ identityToolkit: mock })` + `new FirebaseAuthStrategy({ identityToolkit: mock.client, adminAuth })`.) Import `RpcException` if absent.

- [ ] **Step 2: Run to verify it fails** — `yarn nx test auth-firebase`. Expected: FAIL (methods missing; TS).

- [ ] **Step 3: Implement the client.** In `identity-toolkit.client.ts` add to the `IdentityToolkitClient` interface the two signatures above, and to `HttpIdentityToolkitClient`:

```ts
  async sendPasswordResetEmail(opts: { email: string; continueUrl: string }): Promise<void> {
    await this.post<unknown>('https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email: opts.email,
      continueUrl: opts.continueUrl,
    });
  }

  async confirmPasswordReset(opts: {
    oobCode: string;
    newPassword: string;
  }): Promise<{ email: string }> {
    return this.post<{ email: string }>(
      'https://identitytoolkit.googleapis.com/v1/accounts:resetPassword',
      { oobCode: opts.oobCode, newPassword: opts.newPassword },
    );
  }
```

- [ ] **Step 4: Implement the mocks (time-ordered revocation).** The current mock models revocation as "uid is revoked forever" (`refresh()` throws when `revokedUids.has(uid)`), which would kill the session minted _after_ a revoke. Replace it with ordering: in `mock-identity-toolkit.ts` add `let issueSeq = 0; const refreshSeq = new Map<string, number>(); const revokedAtSeq = new Map<string, number>();`; in `issue()` do `refreshSeq.set(refreshToken, ++issueSeq);`; in `refresh()` replace the `revokedUids` check with:

```ts
const seq = refreshSeq.get(refreshToken) ?? 0;
const cutoff = revokedAtSeq.get(uid);
if (cutoff !== undefined && seq <= cutoff) throw new Error('USER_DISABLED');
```

add to `MockHandle`/returned object `revokeUser(uid) { revokedUids.add(uid); revokedAtSeq.set(uid, issueSeq); }` and `getResetCode(email)`; add reset state `const resetCodes = new Map<string, string>(); const resetByEmail = new Map<string, string>();` and client methods:

```ts
    async sendPasswordResetEmail({ email }) {
      const user = [...users.values()].find((u) => u.email === email);
      if (!user) throw new Error('EMAIL_NOT_FOUND'); // real Identity Toolkit; the gateway swallows it
      const oobCode = `reset_${user.localId}_${randomUUID()}`;
      resetCodes.set(oobCode, email);
      resetByEmail.set(email, oobCode);
    },
    async confirmPasswordReset({ oobCode, newPassword }) {
      const email = resetCodes.get(oobCode);
      if (!email) throw new Error('INVALID_OOB_CODE');
      resetCodes.delete(oobCode);
      resetByEmail.delete(email);
      const user = [...users.values()].find((u) => u.email === email);
      if (!user) throw new Error('EMAIL_NOT_FOUND');
      user.password = newPassword;
      return { email };
    },
```

In `mock-admin-auth.ts` change `revokeRefreshTokens` to `opts.identityToolkit.revokeUser(uid)` and add `getUserByEmail(email)` (`find` by email, throw `USER_NOT_FOUND`) to both the `FakeAdminAuth` interface and the object. Before editing grep for other users of `revokedUids`/`MockHandle` (`grep -rn revokedUids libs apps`) and keep them compiling.

- [ ] **Step 5: Implement the strategy.** In `firebase-auth.strategy.ts` add `getUserByEmail(email: string): Promise<{ uid: string }>;` to `FirebaseAdminAuthLike` (the real `getAuth(app)` already has it) and:

```ts
const INVALID_OOB_CODES = ['INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'] as const;

function isInvalidOobCode(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toUpperCase();
  return INVALID_OOB_CODES.some((code) => message.includes(code));
}
```

```ts
  async requestPasswordReset(email: string, callbackUrl: string): Promise<void> {
    await this.identityToolkit.sendPasswordResetEmail({ email, continueUrl: callbackUrl });
  }

  async confirmPasswordReset(token: string, newPassword: string): Promise<AuthSession> {
    let email: string;
    try {
      ({ email } = await this.identityToolkit.confirmPasswordReset({
        oobCode: token,
        newPassword,
      }));
    } catch (err) {
      if (isInvalidOobCode(err)) throw new RpcException('invalid_reset_token');
      throw err;
    }
    // Firebase's revoke is uid-wide, so it must run BEFORE the new session is
    // minted — afterwards it would kill that one too (plan ruling 1).
    const { uid } = await this.adminAuth.getUserByEmail(email);
    await this.adminAuth.revokeRefreshTokens(uid);
    return this.signIn(email, newPassword);
  }
```

- [ ] **Step 6: Postgres/Mongo stubs.** In both strategies add (next to `sendMagicLink`):

```ts
  async requestPasswordReset(_email: string, _callbackUrl: string): Promise<void> {
    throw new Error('not_implemented');
  }

  async confirmPasswordReset(_token: string, _newPassword: string): Promise<AuthSession> {
    throw new Error('not_implemented');
  }
```

- [ ] **Step 7: Verify** — `yarn nx run-many -t test -p auth-firebase auth-supabase auth-postgres auth-mongodb shared`. Expected: all PASS; then `yarn nx run-many -t build -p auth-firebase auth-postgres auth-mongodb` green.

- [ ] **Step 8: Commit**

```bash
npx prettier --write libs/auth-strategies shared
git add libs/auth-strategies
git commit -m "feat(auth-firebase): password reset (PASSWORD_RESET oob + resetPassword, revoke before new session); postgres/mongo stubs"
```

---
