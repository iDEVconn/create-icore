import { describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import type { SupabaseClient } from '@supabase/supabase-js';
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
