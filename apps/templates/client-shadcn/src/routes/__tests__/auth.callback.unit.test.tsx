import { describe, it, expect } from 'vitest';
import { resolveHashSession } from '../auth.callback';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('resolveHashSession', () => {
  it('extracts accessToken/refreshToken/user from a Supabase implicit-grant hash', () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    const hash = `#access_token=${token}&refresh_token=refresh-abc&expires_in=3600&token_type=bearer&type=magiclink`;
    expect(resolveHashSession(hash)).toEqual({
      accessToken: token,
      refreshToken: 'refresh-abc',
      user: { id: 'user-1', email: 'user@example.com' },
    });
  });

  it('returns null when there is no hash', () => {
    expect(resolveHashSession('')).toBeNull();
  });

  it('returns null when access_token is missing', () => {
    expect(resolveHashSession('#refresh_token=refresh-abc')).toBeNull();
  });

  it('returns null when refresh_token is missing', () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    expect(resolveHashSession(`#access_token=${token}`)).toBeNull();
  });

  it('returns null for an error redirect (expired/invalid link)', () => {
    expect(
      resolveHashSession(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
      ),
    ).toBeNull();
  });

  it('returns null when the access token is not a well-formed JWT', () => {
    expect(resolveHashSession('#access_token=not-a-jwt&refresh_token=refresh-abc')).toBeNull();
  });

  it('returns null when the JWT payload lacks sub or email', () => {
    const token = makeJwt({ sub: 'user-1' });
    expect(resolveHashSession(`#access_token=${token}&refresh_token=refresh-abc`)).toBeNull();
  });
});
