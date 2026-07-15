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
