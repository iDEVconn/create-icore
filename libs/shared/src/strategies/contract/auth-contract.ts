import { describe, expect, it, beforeEach } from 'vitest';
import type { AuthStrategy } from '../auth';

export interface AuthContractHelpers {
  /**
   * Return the magic-link token that `sendMagicLink` just emitted for `email`.
   * Concrete strategies pull this out of their provider mock (Supabase OTP hash
   * registry, Firebase oobCode registry); FakeAuthStrategy exposes its own
   * internal map. Lets the contract round-trip without depending on real email.
   */
  getMagicLinkToken: (strategy: AuthStrategy, email: string) => string;
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
  });
}
