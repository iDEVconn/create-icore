import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit } from '../testing/mock-identity-toolkit';
import { createMockAdminAuth } from '../testing/mock-admin-auth';

function fixture() {
  const toolkit = createMockIdentityToolkit();
  const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
  const strategy = new FirebaseAuthStrategy({ identityToolkit: toolkit.client, adminAuth });
  return { strategy, toolkit };
}

describe('FirebaseAuthStrategy — refresh()', () => {
  it("normalizes a known Identity Toolkit rejection to RpcException('invalid_refresh_token')", async () => {
    const { strategy } = fixture();

    // RpcException (not a plain Error) is required here — NestJS's RPC
    // exception filter discards a plain Error's message entirely when it
    // crosses the gateway<->microservice transport, so auth.guard.ts could
    // never distinguish a dead refresh token from a transient outage.
    // The low-level HttpIdentityToolkitClient throws provider-specific error
    // strings (INVALID_REFRESH_TOKEN, USER_DISABLED, …) — those, and only
    // those, normalize the same way Postgres/MongoDB do.
    let caught: unknown;
    try {
      await strategy.refresh('not-a-real-refresh-token');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RpcException);
    expect((caught as RpcException).getError()).toBe('invalid_refresh_token');
  });

  // The inverse: normalizing EVERY rejection makes AuthGuard delete the
  // session, so a transient securetoken.googleapis.com failure would log a
  // valid user out. Unknown/network/5xx errors must propagate untouched and
  // land on the guard's 503 path instead.
  it.each([
    ['a network failure', new TypeError('fetch failed')],
    ['a provider 5xx', new Error('firebase_refresh_failed_503')],
    ['an unrecognised provider code', new Error('SOMETHING_NEW_FROM_GOOGLE')],
  ])('does NOT report %s as invalid_refresh_token', async (_label, thrown) => {
    const { strategy, toolkit } = fixture();
    toolkit.client.refresh = async () => {
      throw thrown;
    };

    let caught: unknown;
    try {
      await strategy.refresh('rt-that-would-have-worked');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBe(thrown);
    expect(caught).not.toBeInstanceOf(RpcException);
  });
});

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
