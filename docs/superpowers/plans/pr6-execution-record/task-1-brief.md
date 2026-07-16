### Task 1: Supabase `revoke()` + contract-test `revokeIsUserWide` flag infrastructure

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts`
- Modify: `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts`
- Create: `libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts`

**Interfaces:**
- Produces: `AuthContractHelpers.revokeIsUserWide?: boolean` (new optional flag) alongside the existing `supportsRevoke?: boolean`.
- Consumes: `SupabaseClient.auth.admin.signOut(jwt: string, scope?: 'global'|'local'|'others'): Promise<{...}>` (verified signature, `node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts:63`).

**Root cause:** `SupabaseAuthStrategy.revoke()` throws `not_implemented`. Real fix requires deriving the access-token JWT from the refresh token first (Supabase's admin API revokes by JWT, not refresh token).

- [ ] **Step 1: Add the `revokeIsUserWide` flag to the shared contract (infrastructure change, not a strategy fix yet)**

```typescript
// libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts
// Add to the AuthContractHelpers interface, after supportsRevoke:
  /**
   * Set to `true` when revoke() invalidates ALL of a user's sessions rather
   * than just the one tied to the revoked refresh token — e.g. Firebase's
   * revokeRefreshTokens(uid) has no per-session primitive, only a uid-wide
   * one. When true, the "does not affect other sessions" case is replaced
   * with its logical opposite (revoke DOES affect other sessions).
   */
  revokeIsUserWide?: boolean;

// Replace the `else` branch's three revoke tests with:
    } else {
      it('revoke invalidates the refresh token — a further refresh() call fails', async () => {
        const session = await strategy.signUp('revoke-a@x.com', 'pw12345!');
        await strategy.revoke(session.refreshToken);
        await expect(strategy.refresh(session.refreshToken)).rejects.toThrow();
      });

      if (helpers?.revokeIsUserWide) {
        it('revoke invalidates ALL sessions for the same user (uid-wide revocation)', async () => {
          const session = await strategy.signUp('revoke-c@x.com', 'pw12345!');
          const other = await strategy.signIn('revoke-c@x.com', 'pw12345!');
          await strategy.revoke(session.refreshToken);
          await expect(strategy.refresh(other.refreshToken)).rejects.toThrow();
        });
      } else {
        it('revoke does not affect other sessions for the same user', async () => {
          const session = await strategy.signUp('revoke-b@x.com', 'pw12345!');
          const other = await strategy.signIn('revoke-b@x.com', 'pw12345!');
          await strategy.revoke(session.refreshToken);
          await expect(strategy.refresh(other.refreshToken)).resolves.toBeTruthy();
        });
      }

      it('revoke is idempotent — revoking an unknown/already-revoked token does not throw', async () => {
        await expect(strategy.revoke('not-a-real-refresh-token')).resolves.toBeUndefined();
      });
    }
```

This is a test-infrastructure-only change (the `if (helpers?.supportsRevoke === false)` branch above it is untouched). Run: `npx nx test shared -- auth.contract.unit.test.ts` — expected PASS unchanged (fake/postgres/mongodb strategies take the `else` branch's default path, `revokeIsUserWide` is `undefined` for all of them, behavior identical to before).

- [ ] **Step 2: Extend the Supabase mock to actually track `admin.signOut`**

```typescript
// libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts
// Add to the closure, alongside the other Maps:
  const signedOutAccessTokens = new Set<string>();

// Replace the `admin` object's methods, adding signOut:
  const admin = {
    async signOut(jwt: string, _scope?: 'global' | 'local' | 'others') {
      // The mock only ever signs out the single access token passed — matching
      // real Supabase's 'local' scope, which is all this strategy uses.
      signedOutAccessTokens.add(jwt);
      return { error: null };
    },
    async updateUserById(uid: string, updates: { app_metadata?: { role?: string } }) {
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      if (updates.app_metadata && typeof updates.app_metadata.role === 'string') {
        user.role = updates.app_metadata.role;
      }
      return { data: { user: { id: user.id, email: user.email } }, error: null };
    },
    async getUserById(uid: string) {
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      return {
        data: {
          user: { id: user.id, email: user.email, app_metadata: { role: user.role } },
        },
        error: null,
      };
    },
  };

// Replace getUser (in the top-level `auth` object) to honor signed-out tokens:
    async getUser(token?: string) {
      if (!token) return { data: { user: null }, error: { message: 'missing token' } };
      if (signedOutAccessTokens.has(token)) {
        return { data: { user: null }, error: { message: 'session_not_found' } };
      }
      const uid = accessToUid.get(token);
      if (!uid) return { data: { user: null }, error: { message: 'invalid token' } };
      const user = findById(uid);
      if (!user) return { data: { user: null }, error: { message: 'user missing' } };
      return {
        data: {
          user: { id: user.id, email: user.email, app_metadata: { role: user.role } },
        },
        error: null,
      };
    },

// The `auth` object literal now references `admin` (defined above it) instead of its
// own inline `admin: {...}` — move the `admin` object definition above `const auth = {`
// and change the auth object's closing to include `admin,` instead of an inline object.
```

Note: `admin` must be declared before `auth` (or reference it via a `let`/hoisted object) since `auth.admin` now points to the extracted `admin` binding — reorder the declarations so `admin` is defined first, then `const auth = { ...existing methods..., admin };`.

- [ ] **Step 3: Write the failing dedicated Supabase test proving `admin.signOut` actually fires**

```typescript
// libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts
import { describe, expect, it } from 'vitest';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';
import { createMockSupabaseClient } from '../testing/mock-supabase';

describe('SupabaseAuthStrategy — revoke()', () => {
  it('calls admin.signOut so the session access token is also invalidated (not just the refresh token)', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    const session = await strategy.signUp('revoke-signout@x.com', 'pw12345!');
    // Sanity: the access token is valid before revoke.
    await expect(strategy.verifyToken(session.accessToken)).resolves.toBeTruthy();

    await strategy.revoke(session.refreshToken);

    // This can ONLY fail if admin.signOut was genuinely called — refreshSession()
    // alone (the "exchange" step) never touches the access token, only the
    // refresh token, so this assertion is unreachable-by-accident.
    await expect(strategy.verifyToken(session.accessToken)).rejects.toThrow();
  });

  it('revoke on an already-invalid refresh token does not throw (idempotent)', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await expect(strategy.revoke('not-a-real-token')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx nx test auth-supabase -- supabase-auth.strategy.unit.test.ts`
Expected: FAIL — `revoke()` still throws `not_implemented`.

- [ ] **Step 5: Implement `revoke()`**

```typescript
// libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts
  /**
   * Exchanges the refresh token for its session (rotating it — the token was
   * going to die anyway), then signs the resulting access token out with
   * scope 'local' so ONLY that one session ends, not every session the user
   * has open elsewhere.
   */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error || !data.session) return; // already invalid/expired — idempotent
      await this.client.auth.admin.signOut(data.session.access_token, 'local');
    } catch {
      // idempotent: revoking an unknown/already-dead token is not an error
    }
  }
```

Remove the old stub (the `not_implemented` throw and its comment) — replace in place, same method position in the class.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx nx test auth-supabase -- supabase-auth.strategy.unit.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Flip the contract test call site to run full revoke semantics**

```typescript
// libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts
runAuthContract(
  'SupabaseAuthStrategy',
  () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    mocks.set(strategy, mock);
    return strategy;
  },
  {
    // revoke() is fully implemented — see SupabaseAuthStrategy.revoke.
    // Supabase revokes by scope:'local', so it's per-session, not user-wide.
    getMagicLinkToken: (strategy, email) => {
      const mock = mocks.get(strategy as SupabaseAuthStrategy);
      if (!mock) throw new Error('mock not registered for strategy');
      return mock.getMagicLinkToken(email);
    },
    getOAuthCode: (strategy, provider, email) => {
      const mock = mocks.get(strategy as SupabaseAuthStrategy);
      if (!mock) throw new Error('mock not registered for strategy');
      return mock.getOAuthChallenge(provider, email);
    },
  },
);
```

(Removed the `supportsRevoke: false` line and its comment entirely — omitting it defaults to full-semantics per the contract's `if (helpers?.supportsRevoke === false)` check.)

- [ ] **Step 8: Run the full contract + dedicated suites**

Run: `npx nx test auth-supabase`
Expected: PASS — contract's 3 full revoke cases (invalidates / does-not-affect-others / idempotent, since `revokeIsUserWide` is unset for Supabase) plus the 2 new dedicated tests.

- [ ] **Step 9: Run the full shared suite to confirm the contract-helper change didn't break anyone else**

Run: `npx nx test shared`
Expected: PASS — `fake-auth.contract.unit.test.ts` doesn't pass `helpers` at all for its revoke cases (it's the "no helpers" call site using the shared default), so it's unaffected by the new `revokeIsUserWide` flag.

- [ ] **Step 10: Commit**

```bash
npx prettier --write libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts
npx nx lint shared
npx nx lint auth-supabase
git add libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts libs/auth-strategies/supabase/src/lib/supabase-auth.strategy.ts libs/auth-strategies/supabase/src/lib/testing/mock-supabase.ts libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.contract.unit.test.ts libs/auth-strategies/supabase/src/lib/__tests__/supabase-auth.strategy.unit.test.ts
git commit -m "feat(auth): implement SupabaseAuthStrategy.revoke() via refreshSession + admin.signOut('local')"
```

---

