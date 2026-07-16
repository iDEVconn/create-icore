### Task 2: Firebase `revoke()` — uid-wide revocation

**Files:**
- Modify: `libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts`
- Modify: `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts`
- Create: `libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts`

**Interfaces:**
- Produces: `FirebaseAdminAuthLike.revokeRefreshTokens(uid: string): Promise<void>` — new required method on the interface (mirrors `firebase-admin`'s real `BaseAuth.revokeRefreshTokens`, `node_modules/firebase-admin/lib/auth/base-auth.d.ts:321`).

**Root cause:** `FirebaseAuthStrategy.revoke()` throws `not_implemented`. Firebase's only revoke primitive is uid-wide (`adminAuth.revokeRefreshTokens(uid)`), and deriving the uid requires exchanging the refresh token for an ID token first.

- [ ] **Step 1: Add `revokeRefreshTokens` to the interface and its mock**

```typescript
// libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts
// Add to the FirebaseAdminAuthLike interface:
export interface FirebaseAdminAuthLike {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(
    uid: string,
  ): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
  /** Invalidates every refresh token currently issued to this uid (Firebase has
   *  no per-session revoke primitive — this is always uid-wide, unlike
   *  Supabase's/postgres's per-refresh-token revoke). */
  revokeRefreshTokens(uid: string): Promise<void>;
}
```

```typescript
// libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts
import type { MockHandle } from './mock-identity-toolkit';

interface FakeAdminAuthOptions {
  identityToolkit: MockHandle;
}

export interface FakeAdminAuth {
  verifyIdToken(idToken: string): Promise<{ uid: string; email?: string; role?: string }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  getUser(
    uid: string,
  ): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
  revokeRefreshTokens(uid: string): Promise<void>;
}

export function createMockAdminAuth(opts: FakeAdminAuthOptions): FakeAdminAuth {
  const roles = new Map<string, string>();

  return {
    async verifyIdToken(idToken) {
      const uid = opts.identityToolkit.tokensToUid.get(idToken);
      if (!uid) throw new Error('TOKEN_NOT_FOUND');
      const user = [...opts.identityToolkit.users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      return { uid: user.localId, email: user.email, role: roles.get(uid) };
    },
    async setCustomUserClaims(uid, claims) {
      const role = claims['role'];
      if (typeof role === 'string') roles.set(uid, role);
    },
    async getUser(uid) {
      const user = [...opts.identityToolkit.users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      const role = roles.get(uid);
      return {
        uid: user.localId,
        email: user.email,
        customClaims: role ? { role } : undefined,
      };
    },
    async revokeRefreshTokens(uid) {
      opts.identityToolkit.revokedUids.add(uid);
    },
  };
}
```

- [ ] **Step 2: Make the mock identity toolkit honor uid-wide revocation**

```typescript
// libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts
// Add to the MockHandle interface:
export interface MockHandle {
  client: IdentityToolkitClient;
  users: Map<string, FakeUser>;
  tokensToUid: Map<string, string>;
  refreshToUid: Map<string, string>;
  revokedUids: Set<string>;
  getOobCode(email: string): string;
  registerOAuthCode(code: string, email: string): void;
  tokenClient: import('../identity-toolkit.client').OAuthTokenClient;
}

// Inside createMockIdentityToolkit(), add alongside the other Maps:
  const revokedUids = new Set<string>();

// Replace the refresh() method to check revocation before honoring the refresh:
    async refresh(refreshToken) {
      const uid = refreshToUid.get(refreshToken);
      if (!uid) throw new Error('INVALID_REFRESH_TOKEN');
      if (revokedUids.has(uid)) throw new Error('USER_DISABLED'); // matches real Firebase's error family
      refreshToUid.delete(refreshToken); // Firebase rotates
      const user = [...users.values()].find((u) => u.localId === uid);
      if (!user) throw new Error('USER_NOT_FOUND');
      const session = issue(user);
      return {
        id_token: session.idToken,
        refresh_token: session.refreshToken,
        expires_in: session.expiresIn,
        user_id: user.localId,
      } satisfies IdentityToolkitRefreshResponse;
    },

// Add revokedUids to the returned object:
  return {
    client,
    users,
    tokensToUid,
    refreshToUid,
    revokedUids,
    getOobCode(email: string): string {
      const code = oobByEmail.get(email);
      if (!code) throw new Error(`no oobCode issued for ${email}`);
      return code;
    },
    registerOAuthCode(code: string, email: string) {
      oauthCodeToEmail.set(code, email);
    },
    tokenClient,
  };
```

Note the ordering: `revoke()`'s own internal `identityToolkit.refresh(refreshToken)` call (to derive the uid) runs **before** `adminAuth.revokeRefreshTokens(uid)` is called — so at that moment `revokedUids` doesn't have the uid yet and the internal exchange succeeds correctly. Only refresh calls *after* revocation completes see the uid in `revokedUids`.

- [ ] **Step 3: Write the failing dedicated Firebase test proving `revokeRefreshTokens` actually fires and is uid-wide**

```typescript
// libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts
import { describe, expect, it } from 'vitest';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit } from '../testing/mock-identity-toolkit';
import { createMockAdminAuth } from '../testing/mock-admin-auth';

function fixture() {
  const toolkit = createMockIdentityToolkit();
  const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
  const strategy = new FirebaseAuthStrategy({ identityToolkit: toolkit.client, adminAuth });
  return { strategy, toolkit };
}

describe('FirebaseAuthStrategy — revoke()', () => {
  it('calls revokeRefreshTokens(uid), invalidating a DIFFERENT still-live session for the same user', async () => {
    const { strategy } = fixture();
    const session = await strategy.signUp('revoke-fb@x.com', 'pw12345!');
    const otherSession = await strategy.signIn('revoke-fb@x.com', 'pw12345!');

    await strategy.revoke(session.refreshToken);

    // This can ONLY fail if revokeRefreshTokens(uid) was genuinely called —
    // the "exchange" step (identityToolkit.refresh) only ever consumes
    // session.refreshToken itself, never otherSession's independent token.
    await expect(strategy.refresh(otherSession.refreshToken)).rejects.toThrow();
  });

  it('revoke on an already-invalid refresh token does not throw (idempotent)', async () => {
    const { strategy } = fixture();
    await expect(strategy.revoke('not-a-real-token')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx nx test auth-firebase -- firebase-auth.strategy.unit.test.ts`
Expected: FAIL — `revoke()` still throws `not_implemented`.

- [ ] **Step 5: Implement `revoke()`**

```typescript
// libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts
  /**
   * Exchanges the refresh token to derive its uid (Firebase refresh tokens are
   * opaque — there's no way to read the uid without a round-trip), then calls
   * revokeRefreshTokens(uid). This invalidates EVERY session that uid has open,
   * not just this one — Firebase has no narrower primitive. A single logout
   * ends all of a Firebase user's sessions; this is a real SDK limitation, not
   * a design choice.
   */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const res = await this.identityToolkit.refresh(refreshToken);
      const verified = await this.adminAuth.verifyIdToken(res.id_token);
      await this.adminAuth.revokeRefreshTokens(verified.uid);
    } catch {
      // idempotent: revoking an unknown/already-dead token is not an error
    }
  }
```

Remove the old stub (the `not_implemented` throw and its comment) — replace in place.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx nx test auth-firebase -- firebase-auth.strategy.unit.test.ts`
Expected: PASS (2/2).

- [ ] **Step 7: Flip the contract test call site — full revoke semantics, marked user-wide**

```typescript
// libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts
runAuthContract(
  'FirebaseAuthStrategy',
  () => {
    const toolkit = createMockIdentityToolkit();
    const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
    const strategy = new FirebaseAuthStrategy({
      identityToolkit: toolkit.client,
      adminAuth,
      oauth: {
        google: { clientId: 'g-client', clientSecret: 'g-secret' },
        github: { clientId: 'gh-client', clientSecret: 'gh-secret' },
      },
      oauthTokenClient: toolkit.tokenClient,
    });
    toolkits.set(strategy, toolkit);
    return strategy;
  },
  {
    // revoke() is fully implemented — see FirebaseAuthStrategy.revoke. Firebase
    // has no per-session revoke primitive, so it's uid-wide: revoking one
    // session ends every session for that user.
    revokeIsUserWide: true,
    getMagicLinkToken: (strategy, email) => {
      const toolkit = toolkits.get(strategy as FirebaseAuthStrategy);
      if (!toolkit) throw new Error('toolkit not registered for strategy');
      const oobCode = toolkit.getOobCode(email);
      const emailB64 = Buffer.from(email, 'utf8').toString('base64');
      return `${emailB64}:${oobCode}`;
    },
    getOAuthCode: (strategy, _provider, email) => {
      const toolkit = toolkits.get(strategy as FirebaseAuthStrategy);
      if (!toolkit) throw new Error('toolkit not registered for strategy');
      const code = randomUUID();
      toolkit.registerOAuthCode(code, email);
      const pending = (
        strategy as unknown as {
          pendingStates: Map<string, { provider: string }>;
        }
      ).pendingStates;
      const state = [...pending.keys()][0];
      if (!state) throw new Error('no pending OAuth state on strategy');
      return { code, state };
    },
  },
);
```

(Removed the `supportsRevoke: false` line and its comment; added `revokeIsUserWide: true`. The rest of the file — imports, the `toolkits` WeakMap, the strategy factory — is unchanged.)

- [ ] **Step 8: Run the full contract + dedicated suites**

Run: `npx nx test auth-firebase`
Expected: PASS — contract's uid-wide revoke case (from Task 1's `revokeIsUserWide` branch) plus the 2 new dedicated tests.

- [ ] **Step 9: Run the full shared suite once more**

Run: `npx nx test shared`
Expected: PASS, unaffected (same reasoning as Task 1 Step 9).

- [ ] **Step 10: Commit**

```bash
npx prettier --write libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts
npx nx lint auth-firebase
git add libs/auth-strategies/firebase/src/lib/firebase-auth.strategy.ts libs/auth-strategies/firebase/src/lib/testing/mock-admin-auth.ts libs/auth-strategies/firebase/src/lib/testing/mock-identity-toolkit.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.strategy.unit.test.ts
git commit -m "feat(auth): implement FirebaseAuthStrategy.revoke() via identityToolkit exchange + revokeRefreshTokens(uid)"
```

---

