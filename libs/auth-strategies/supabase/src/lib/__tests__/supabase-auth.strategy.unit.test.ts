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
