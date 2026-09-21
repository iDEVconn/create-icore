import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import type { AuthClientService } from '@icore/auth-client';
import { FakeSessionStore } from '@icore/shared';
import type { Request, Response } from 'express';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function makeAuthClient(): AuthClientService {
  return {
    signup: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    login: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    refresh: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
    sendMagicLink: vi.fn().mockResolvedValue(undefined),
    verifyMagicLink: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    startOAuth: vi.fn().mockResolvedValue({
      redirectUrl: 'https://provider.example.com/auth?state=abc',
      state: 'abc',
    }),
    completeOAuth: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    verify: vi.fn().mockResolvedValue({ uid: 'u1', email: 'a@x.com', role: 'user' }),
  } as unknown as AuthClientService;
}

function mockRes() {
  const cookies: Record<string, string> = {};
  const clearedCookies: string[] = [];
  let redirectedTo: string | null = null;
  const res = {
    cookie: vi.fn((name: string, value: string) => {
      cookies[name] = value;
      return res;
    }),
    clearCookie: vi.fn((name: string) => {
      clearedCookies.push(name);
      return res;
    }),
    redirect: vi.fn((url: string) => {
      redirectedTo = url;
      return res;
    }),
    get cookies() {
      return cookies;
    },
    get clearedCookies() {
      return clearedCookies;
    },
    get redirectedTo() {
      return redirectedTo;
    },
  };
  return res as unknown as Response & {
    cookies: Record<string, string>;
    clearedCookies: string[];
    redirectedTo: string | null;
  };
}

describe('AuthController — magic-link', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(
      client,
      makeConfig({ CLIENT_ORIGIN: 'https://my.app' }),
      sessionStore,
    );
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, creates a session record, sets cookies, and returns { user } only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const result = await controller.verifyMagicLink({ token: 'tok' }, res);
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect((result as unknown as { accessToken?: string }).accessToken).toBeUndefined();
    expect(res.cookies['icore_sid']).toBeTruthy();
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login creates a session record and returns only { user }', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const result = await controller.login({ email: 'a@x.com', password: 'pw' }, res);
    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect((result as unknown as { accessToken?: string }).accessToken).toBeUndefined();
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_sid',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register creates a session record and returns only { user }', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const result = await controller.register({ email: 'a@x.com', password: 'password123' }, res);
    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: 'user' } });
    expect(res.cookies['icore_sid']).toBeTruthy();
  });
});

// Regression guard for the branch's most load-bearing bug: SessionRecord.role
// was never populated on any normal login path, so AuthGuard put
// `role: undefined` on req.user and AbilityFactory treated every admin as a
// plain user -- silently disabling every @CheckAbility gate, including this
// branch's own POST /auth/admin/revoke-user/:uid.
describe('AuthController — role resolution onto the session record', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  async function storedRecord(res: ReturnType<typeof mockRes>) {
    const sessionId = res.cookies['icore_sid'] as string;
    expect(sessionId).toBeTruthy();
    const record = await sessionStore.get(sessionId);
    expect(record).not.toBeNull();
    return record as NonNullable<typeof record>;
  }

  it.each([
    [
      'login',
      (c: AuthController, res: Response) => c.login({ email: 'a@x.com', password: 'p' }, res),
    ],
    [
      'register',
      (c: AuthController, res: Response) => c.register({ email: 'a@x.com', password: 'p' }, res),
    ],
    [
      'magic-link verify',
      (c: AuthController, res: Response) => c.verifyMagicLink({ token: 't' }, res),
    ],
  ])('%s persists the admin role onto the session record', async (_name, call) => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: 'u1',
      email: 'a@x.com',
      role: 'admin',
    });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await call(controller, res);
    // verify() is called with the access token the provider just issued --
    // the only way to learn the role, since AuthSession carries no role.
    expect(client.verify).toHaveBeenCalledWith('at');
    expect((await storedRecord(res)).role).toBe('admin');
  });

  it('oauthCallback persists the admin role onto the session record too', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockResolvedValue({
      uid: 'u1',
      email: 'a@x.com',
      role: 'admin',
    });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as Request;
    await controller.oauthCallback('google', 'code-xyz', 'abc', req, res);
    expect((await storedRecord(res)).role).toBe('admin');
  });

  it('a user with no role claim gets an undefined role (fails closed, no fabricated role)', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'u1', email: 'a@x.com' });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await controller.login({ email: 'a@x.com', password: 'p' }, res);
    expect((await storedRecord(res)).role).toBeUndefined();
  });

  it('still logs the user in when role resolution fails (verify blip must not 500 a good login)', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('auth MS down'));
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const result = await controller.login({ email: 'a@x.com', password: 'p' }, res);
    expect(result).toEqual({ user: { id: 'u1', email: 'a@x.com', role: undefined } });
    expect((await storedRecord(res)).role).toBeUndefined();
  });
});

describe('AuthController — session/adopt', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('verifies the access token, cross-checks it against a real refresh(), and starts a session with the rotated pair + verified role', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const result = await controller.adoptSession(
      { accessToken: 'supabase-at', refreshToken: 'supabase-rt' },
      res,
    );
    expect(client.verify).toHaveBeenCalledWith('supabase-at');
    expect(client.refresh).toHaveBeenCalledWith('supabase-rt');
    expect(result).toEqual({
      user: { id: 'u1', email: 'a@x.com', role: 'user' },
    });
    expect(res.cookies['icore_sid']).toBeTruthy();
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('rejects with 401 and creates no session when the access token fails verification', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('invalid_jwt'));
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await expect(
      controller.adoptSession({ accessToken: 'garbage', refreshToken: 'rt' }, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookies['icore_sid']).toBeUndefined();
    expect(res.cookies['icore_csrf']).toBeUndefined();
  });

  it('rejects with 401 and creates no session when the refresh token fails validation', async () => {
    const client = makeAuthClient();
    (client.refresh as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('invalid_refresh_token'),
    );
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await expect(
      controller.adoptSession({ accessToken: 'supabase-at', refreshToken: 'garbage' }, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookies['icore_sid']).toBeUndefined();
    expect(res.cookies['icore_csrf']).toBeUndefined();
  });

  it('rejects with 401 when the access token and refresh token belong to different users (token-substitution defense)', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uid: 'attacker-uid',
      email: 'attacker@x.com',
      role: 'user',
    });
    (client.refresh as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      accessToken: 'victim-at',
      refreshToken: 'victim-rt-rotated',
      expiresIn: 3600,
      user: { id: 'victim-uid', email: 'victim@x.com' },
    });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await expect(
      controller.adoptSession(
        { accessToken: 'attacker-own-valid-at', refreshToken: 'stolen-victim-rt' },
        res,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookies['icore_sid']).toBeUndefined();
    expect(res.cookies['icore_csrf']).toBeUndefined();
  });
});

describe('AuthController — session', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('getSession returns the user resolved onto req by AuthGuard', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const req = { user: { uid: 'u1', email: 'a@x.com', role: 'user' } } as unknown as Request;
    await expect(controller.getSession(req)).resolves.toEqual({
      user: { id: 'u1', email: 'a@x.com', role: 'user' },
    });
  });

  it('getSession throws 401 when AuthGuard did not populate req.user', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const req = {} as unknown as Request;
    await expect(controller.getSession(req)).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthController — logout', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('deletes the session record before revoking, then clears both cookies', async () => {
    const client = makeAuthClient();
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@x.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const req = { cookies: { icore_sid: record.sessionId } } as unknown as Request;
    const res = mockRes();
    await controller.logout(req, res);
    expect(await sessionStore.get(record.sessionId)).toBeNull();
    expect(client.revoke).toHaveBeenCalledWith('rt1');
    expect(res.clearedCookies).toContain('icore_sid');
    expect(res.clearedCookies).toContain('icore_csrf');
  });

  it('is idempotent when there is no session cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const req = { cookies: {} } as unknown as Request;
    const res = mockRes();
    await expect(controller.logout(req, res)).resolves.toEqual({ ok: true });
    expect(client.revoke).not.toHaveBeenCalled();
    expect(res.clearedCookies).toContain('icore_sid');
  });

  it('still deletes the session and clears cookies when the provider revoke rejects (MS/transport failure)', async () => {
    const client = makeAuthClient();
    (client.revoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('transport down'));
    const record = await sessionStore.create({
      uid: 'u1',
      email: 'a@x.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const req = { cookies: { icore_sid: record.sessionId } } as unknown as Request;
    const res = mockRes();
    await expect(controller.logout(req, res)).resolves.toEqual({ ok: true });
    expect(client.revoke).toHaveBeenCalledWith('rt1');
    expect(await sessionStore.get(record.sessionId)).toBeNull();
    expect(res.clearedCookies).toContain('icore_sid');
  });

  it('still clears both cookies when the session store itself is down (Redis blip must not 500 a logout)', async () => {
    const client = makeAuthClient();
    const brokenStore = {
      get: vi.fn().mockRejectedValue(new Error('Connection is closed')),
      delete: vi.fn().mockRejectedValue(new Error('Connection is closed')),
    } as unknown as FakeSessionStore;
    const controller = new AuthController(client, makeConfig({}), brokenStore);
    const req = { cookies: { icore_sid: 'sid-1' } } as unknown as Request;
    const res = mockRes();
    await expect(controller.logout(req, res)).resolves.toEqual({ ok: true });
    expect(res.clearedCookies).toContain('icore_sid');
    expect(res.clearedCookies).toContain('icore_csrf');
  });
});

describe('AuthController — admin revoke-user', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('admin revoke-user kills every session for that uid', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const s1 = await sessionStore.create({
      uid: 'target',
      email: 't@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    await controller.revokeUser('target');
    expect(await sessionStore.get(s1.sessionId)).toBeNull();
    expect(client.revoke).toHaveBeenCalledWith('rt1');
  });

  it('still returns { ok: true } when the provider revoke rejects for one of the killed sessions', async () => {
    const client = makeAuthClient();
    (client.revoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('transport down'));
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const s1 = await sessionStore.create({
      uid: 'target',
      email: 't@b.com',
      providerAccessToken: 'at1',
      providerRefreshToken: 'rt1',
      providerAccessTokenExpiresAt: Date.now() + 3600_000,
    });
    await expect(controller.revokeUser('target')).resolves.toEqual({ ok: true });
    expect(await sessionStore.get(s1.sessionId)).toBeNull();
    expect(client.revoke).toHaveBeenCalledWith('rt1');
  });
});

describe('AuthController — OAuth', () => {
  let sessionStore: FakeSessionStore;

  beforeEach(() => {
    sessionStore = new FakeSessionStore();
  });

  it('oauthStart sets a state cookie and redirects to the provider URL', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(
      client,
      makeConfig({ API_ORIGIN: 'http://api' }),
      sessionStore,
    );
    const res = mockRes();
    await controller.oauthStart('google', res);
    expect(client.startOAuth).toHaveBeenCalledWith(
      'google',
      'http://api/api/auth/oauth/google/callback',
    );
    expect(res.cookies['oauth_state']).toBe('abc');
    expect(res.redirectedTo).toBe('https://provider.example.com/auth?state=abc');
  });

  it('oauthCallback rejects when cookie state does not match query state', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    const req = { cookies: { oauth_state: 'right' } } as unknown as Request;
    await expect(controller.oauthCallback('google', 'code', 'wrong', req, res)).rejects.toThrow();
  });

  it('oauthCallback exchanges the code, creates a session, sets cookies, and redirects to the dashboard with no tokens in the URL', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(
      client,
      makeConfig({ CLIENT_ORIGIN: 'http://client' }),
      sessionStore,
    );
    const res = mockRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as Request;
    await controller.oauthCallback('google', 'code-xyz', 'abc', req, res);
    expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
    expect(res.clearedCookies).toContain('oauth_state');
    expect(res.cookies['icore_sid']).toBeTruthy();
    expect(res.redirectedTo).toBe('http://client/dashboard');
  });

  it('oauthStart rejects unknown providers', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}), sessionStore);
    const res = mockRes();
    await expect(controller.oauthStart('apple', res)).rejects.toThrow();
  });
});
