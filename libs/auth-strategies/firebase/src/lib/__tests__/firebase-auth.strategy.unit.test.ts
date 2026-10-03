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

describe('FirebaseAuthStrategy — password reset', () => {
  it('requestPasswordReset sends a PASSWORD_RESET email for a known user', async () => {
    const { strategy, toolkit } = fixture();
    await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    expect(toolkit.getResetCode('a@x.com')).toBeTruthy();
  });

  it("confirmPasswordReset maps a bad oobCode to RpcException('invalid_reset_token')", async () => {
    const { strategy } = fixture();
    const err = await strategy.confirmPasswordReset('bogus', 'newpw123!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('invalid_reset_token');
  });

  it('revokes every refresh token issued BEFORE the reset but not the one it returns', async () => {
    const { strategy, toolkit } = fixture();
    const before = await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    const fresh = await strategy.confirmPasswordReset(toolkit.getResetCode('a@x.com'), 'newpw123!');
    await expect(strategy.refresh(before.refreshToken)).rejects.toThrow();
    await expect(strategy.refresh(fresh.refreshToken)).resolves.toBeTruthy();
  });
});

describe('FirebaseAuthStrategy — password reset hardening', () => {
  it('requestPasswordReset for an unknown email resolves silently (no enumeration, no error log)', async () => {
    const { strategy } = fixture();
    await expect(
      strategy.requestPasswordReset('nobody@x.com', 'https://my.app/reset-password'),
    ).resolves.toBeUndefined();
  });

  it('sends the continue URL to /login so a reset done on the Firebase-hosted page lands somewhere valid', async () => {
    const { strategy, toolkit } = fixture();
    await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    expect(toolkit.getLastResetContinueUrl()).toBe('https://my.app/login');
  });

  it("maps Firebase's WEAK_PASSWORD to RpcException('weak_password')", async () => {
    const { strategy, toolkit } = fixture();
    await strategy.signUp('a@x.com', 'pw12345!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    const err = await strategy
      .confirmPasswordReset(toolkit.getResetCode('a@x.com'), '123')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('weak_password');
  });

  it('the explicit uid-wide revoke is best-effort: Firebase already invalidates refresh tokens on a password change', async () => {
    const toolkit = createMockIdentityToolkit();
    const base = createMockAdminAuth({ identityToolkit: toolkit });
    const adminAuth = {
      ...base,
      revokeRefreshTokens: async () => {
        throw new Error('revoke_failed');
      },
    };
    const strategy = new FirebaseAuthStrategy({ identityToolkit: toolkit.client, adminAuth });
    const before = await strategy.signUp('a@x.com', 'oldpw123!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');

    const fresh = await strategy.confirmPasswordReset(toolkit.getResetCode('a@x.com'), 'newpw123!');

    await expect(strategy.refresh(before.refreshToken)).rejects.toThrow();
    await expect(strategy.refresh(fresh.refreshToken)).resolves.toBeTruthy();
  });
});
