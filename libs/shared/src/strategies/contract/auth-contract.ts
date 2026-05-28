import { describe, expect, it, beforeEach } from 'vitest';
import type { AuthStrategy } from '../auth';

export function runAuthContract(name: string, factory: () => AuthStrategy): void {
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

    it('setRole writes a role visible on verifyToken', async () => {
      const session = await strategy.signUp('e@x.com', 'pw12345!');
      await strategy.setRole(session.user.id, 'admin');
      const reLogged = await strategy.signIn('e@x.com', 'pw12345!');
      const verified = await strategy.verifyToken(reLogged.accessToken);
      expect(verified.role).toBe('admin');
    });
  });
}
