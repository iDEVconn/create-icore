import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailConfirmationRequiredError } from '@icore/shared';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';
import { createMockSupabaseClient } from '../testing/mock-supabase';

describe('SupabaseAuthStrategy — refresh()', () => {
  it("throws RpcException('invalid_refresh_token') on a genuinely dead refresh token", async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    // RpcException (not a plain Error) is required here — NestJS's RPC
    // exception filter discards a plain Error's message entirely when it
    // crosses the gateway<->microservice transport, so auth.guard.ts could
    // never distinguish a dead refresh token from a transient outage.
    let caught: unknown;
    try {
      await strategy.refresh('not-a-real-refresh-token');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(RpcException);
    expect((caught as RpcException).getError()).toBe('invalid_refresh_token');
  });

  // The other half of the same classification: normalizing EVERY error to
  // invalid_refresh_token makes AuthGuard delete the session, so a 30-second
  // GoTrue outage would log every user out. Transient failures must stay
  // un-normalized and land on the guard's 503 path with the session intact.
  it.each([
    [
      'a retryable fetch error (network/DNS)',
      { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 },
    ],
    [
      'a provider 5xx',
      { name: 'AuthApiError', message: 'Service Unavailable', status: 503, code: 'unexpected' },
    ],
    [
      'rate limiting',
      {
        name: 'AuthApiError',
        message: 'Too Many Requests',
        status: 429,
        code: 'over_request_rate',
      },
    ],
    ['an unrecognised error shape', { message: 'something odd happened' }],
  ])('does NOT report %s as invalid_refresh_token', async (_label, error) => {
    const client = {
      auth: {
        refreshSession: async () => ({ data: { session: null, user: null }, error }),
      },
    } as unknown as SupabaseClient;
    const strategy = new SupabaseAuthStrategy({ client });

    let caught: unknown;
    try {
      await strategy.refresh('rt-that-would-have-worked');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(RpcException);
    expect((caught as Error).message).not.toContain('invalid_refresh_token');
  });
});

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

describe('SupabaseAuthStrategy — signUp() with email confirmation', () => {
  it('throws EmailConfirmationRequiredError (not a generic Error) when GoTrue returns a user but no session', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    const err = await strategy.signUp('a@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    expect((err as EmailConfirmationRequiredError).user.email).toBe('a@x.com');
    expect((err as EmailConfirmationRequiredError).user.id).toBeTruthy();
  });

  it('passes callbackUrl to GoTrue as emailRedirectTo', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    await strategy
      .signUp('b@x.com', 'pw12345!', { callbackUrl: 'https://my.app/auth/callback' })
      .catch(() => undefined);

    expect(mock.getLastSignUpOptions()).toEqual({
      emailRedirectTo: 'https://my.app/auth/callback',
    });
  });

  it('still returns a session when confirmation is disabled', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    const session = await strategy.signUp('c@x.com', 'pw12345!');
    expect(session.user.email).toBe('c@x.com');
  });

  it('real provider errors (e.g. user exists) still throw a plain Error', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('d@x.com', 'pw12345!');
    const err = await strategy.signUp('d@x.com', 'pw12345!').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EmailConfirmationRequiredError);
  });
});

describe('SupabaseAuthStrategy — signUp() for an already-registered email (Confirm email ON)', () => {
  it('flags the obfuscated user GoTrue returns, so callers never treat its random id as a real account', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('a@x.com', 'pw12345!').catch(() => undefined);

    const err = await strategy.signUp('a@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    expect((err as EmailConfirmationRequiredError).existingAccount).toBe(true);
  });

  it('does not flag a genuinely new user', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });

    const err = await strategy.signUp('b@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmailConfirmationRequiredError);
    expect((err as EmailConfirmationRequiredError).existingAccount).toBe(false);
  });
});

describe('SupabaseAuthStrategy — signIn() before email confirmation', () => {
  it("throws RpcException('email_not_confirmed') so it survives the RPC boundary", async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('e@x.com', 'pw12345!').catch(() => undefined);

    const err = await strategy.signIn('e@x.com', 'pw12345!').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RpcException);
    expect((err as RpcException).getError()).toBe('email_not_confirmed');
  });

  it('signs in normally once the email is confirmed', async () => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('f@x.com', 'pw12345!').catch(() => undefined);
    mock.confirmEmail('f@x.com');
    const session = await strategy.signIn('f@x.com', 'pw12345!');
    expect(session.user.email).toBe('f@x.com');
  });
});

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

describe('SupabaseAuthStrategy — password reset fails closed', () => {
  it('if ending the sessions fails it aborts BEFORE the password changes (never "new password, old sessions alive")', async () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    await strategy.signUp('a@x.com', 'oldpw123!');
    await strategy.requestPasswordReset('a@x.com', 'https://my.app/reset-password');
    const admin = (mock.client as unknown as { auth: { admin: { signOut: unknown } } }).auth.admin;
    admin.signOut = async () => ({ error: { message: 'boom' } });

    await expect(
      strategy.confirmPasswordReset(mock.getPasswordResetToken('a@x.com'), 'newpw123!'),
    ).rejects.toThrow('boom');

    await expect(strategy.signIn('a@x.com', 'oldpw123!')).resolves.toBeTruthy();
    await expect(strategy.signIn('a@x.com', 'newpw123!')).rejects.toThrow();
  });
});
