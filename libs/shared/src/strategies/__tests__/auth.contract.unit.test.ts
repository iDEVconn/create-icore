import type { AuthStrategy, OAuthProvider } from '../auth';

export interface AuthContractHelpers {
  /**
   * Return the magic-link token that `sendMagicLink` just emitted for `email`.
   * Concrete strategies pull this out of their provider mock (Supabase OTP hash
   * registry, Firebase oobCode registry); FakeAuthStrategy exposes its own
   * internal map. Lets the contract round-trip without depending on real email.
   */
  getMagicLinkToken: (strategy: AuthStrategy, email: string) => string;
  /**
   * Pre-register an OAuth code+state pair so `completeOAuth` can be exercised
   * without an actual provider redirect. Optional — when absent, the OAuth
   * round-trip contract cases skip.
   */
  getOAuthCode?: (
    strategy: AuthStrategy,
    provider: OAuthProvider,
    email: string,
  ) => { code: string; state: string };
  /**
   * Set to `false` when the strategy intentionally does not support revoke()
   * (its SDK has no clean "delete by refresh-token string" mapping — see
   * SupabaseAuthStrategy / FirebaseAuthStrategy). When absent or `true`, the
   * contract asserts full revoke semantics; when `false`, it instead asserts
   * the documented `not_implemented` rejection so the stub stays covered.
   */
  supportsRevoke?: boolean;
  /**
   * Set to `true` when revoke() invalidates ALL of a user's sessions rather
   * than just the one tied to the revoked refresh token — e.g. Firebase's
   * revokeRefreshTokens(uid) has no per-session primitive, only a uid-wide
   * one. When true, the "does not affect other sessions" case is replaced
   * with its logical opposite (revoke DOES affect other sessions).
   */
  revokeIsUserWide?: boolean;
}

export function runAuthContract(
  name: string,
  factory: () => AuthStrategy,
  helpers?: AuthContractHelpers,
): void {
  describe(`AuthStrategy contract: ${name}`, () => {
    let strategy: AuthStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('signUp returns a session for new user', async () => {
      const session = await strategy.signUp('a@x.com', 'pw12345!');
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
      expect(session.user.email).toBe('a@x.com');
    });

    it('signIn returns a session after signUp', async () => {
      await strategy.signUp('b@x.com', 'pw12345!');
      const session = await strategy.signIn('b@x.com', 'pw12345!');
      expect(session.user.email).toBe('b@x.com');
    });

    it('verifyToken resolves the uid from a signUp token', async () => {
      const session = await strategy.signUp('c@x.com', 'pw12345!');
      const verified = await strategy.verifyToken(session.accessToken);
      expect(verified.uid).toBe(session.user.id);
    });

    it('verifyToken rejects bogus token', async () => {
      await expect(strategy.verifyToken('not-a-token')).rejects.toThrow();
    });

    it('refresh issues a new session for the same user', async () => {
      const first = await strategy.signUp('d@x.com', 'pw12345!');
      const next = await strategy.refresh(first.refreshToken);
      expect(next.user.id).toBe(first.user.id);
    });

    it('used refresh token is rejected after rotation', async () => {
      const first = await strategy.signUp('f@x.com', 'pw12345!');
      await strategy.refresh(first.refreshToken);
      await expect(strategy.refresh(first.refreshToken)).rejects.toThrow();
    });

    if (helpers?.supportsRevoke === false) {
      it('revoke rejects — strategy documents revoke as not implemented', async () => {
        const session = await strategy.signUp('revoke-x@x.com', 'pw12345!');
        await expect(strategy.revoke(session.refreshToken)).rejects.toThrow();
      });
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

    it('setRole writes a role visible on verifyToken', async () => {
      const session = await strategy.signUp('e@x.com', 'pw12345!');
      await strategy.setRole(session.user.id, 'admin');
      const reLogged = await strategy.signIn('e@x.com', 'pw12345!');
      const verified = await strategy.verifyToken(reLogged.accessToken);
      expect(verified.role).toBe('admin');
    });

    it('getRole returns null when no role has been set', async () => {
      const session = await strategy.signUp('g@x.com', 'pw12345!');
      expect(await strategy.getRole(session.user.id)).toBeNull();
    });

    it('getRole returns the role most recently set via setRole', async () => {
      const session = await strategy.signUp('h@x.com', 'pw12345!');
      await strategy.setRole(session.user.id, 'admin');
      expect(await strategy.getRole(session.user.id)).toBe('admin');
    });

    if (helpers) {
      it('sendMagicLink + verifyMagicLink round-trips a session', async () => {
        const email = 'ml@x.com';
        await strategy.sendMagicLink({ email, callbackUrl: 'http://localhost/cb' });
        const token = helpers.getMagicLinkToken(strategy, email);
        const session = await strategy.verifyMagicLink(token);
        expect(session.user.email).toBe(email);
        expect(session.accessToken).toBeTruthy();
      });

      it('verifyMagicLink rejects bogus token', async () => {
        await expect(strategy.verifyMagicLink('not-a-real-token')).rejects.toThrow();
      });
    }

    if (helpers?.getOAuthCode) {
      it('startOAuth + completeOAuth round-trips a session', async () => {
        const email = 'oauth@x.com';
        const start = await strategy.startOAuth('google', 'http://localhost/cb');
        expect(start.redirectUrl).toBeTruthy();
        const { code, state } = helpers.getOAuthCode!(strategy, 'google', email);
        const session = await strategy.completeOAuth('google', code, state);
        expect(session.user.email).toBe(email);
        expect(session.accessToken).toBeTruthy();
      });

      it('completeOAuth rejects mismatched state', async () => {
        await strategy.startOAuth('google', 'http://localhost/cb');
        await expect(strategy.completeOAuth('google', 'anything', 'wrong-state')).rejects.toThrow();
      });
    }
  });
}
