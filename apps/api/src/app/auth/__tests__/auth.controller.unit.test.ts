import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AuthClientService } from '@icore/auth-client';
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

function makeRes() {
  const headers: Record<string, string> = {};
  let redirectedTo: string | null = null;
  const cookies: Record<string, string> = {};
  let cookieCleared = false;
  return {
    cookie(name: string, value: string) {
      cookies[name] = value;
      return this;
    },
    clearCookie() {
      cookieCleared = true;
      return this;
    },
    redirect(url: string) {
      redirectedTo = url;
      return this;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    get redirectedTo() {
      return redirectedTo;
    },
    get cookies() {
      return cookies;
    },
    get cookieCleared() {
      return cookieCleared;
    },
  };
}

describe('AuthController (gateway) — magic-link', () => {
  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'https://my.app' }));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.verifyMagicLink(
      { token: 'tok' },
      res as unknown as import('express').Response,
    );
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.login(
      { email: 'a@x.com', password: 'pw' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.register(
      { email: 'a@x.com', password: 'password123' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
  });
});

describe('AuthController (gateway) — session/adopt', () => {
  it('verifies the access token, sets both cookies, and returns accessToken+user', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const result = await controller.adoptSession(
      { accessToken: 'supabase-at', refreshToken: 'supabase-rt' },
      res as unknown as import('express').Response,
    );
    expect(client.verify).toHaveBeenCalledWith('supabase-at');
    expect(result).toEqual({
      accessToken: 'supabase-at',
      user: { id: 'u1', email: 'a@x.com', role: 'user' },
    });
    expect(res.cookies['icore_rt']).toBe('supabase-rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('rejects with 401 and sets no cookies when the access token fails verification', async () => {
    const client = makeAuthClient();
    (client.verify as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('invalid_jwt'));
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    await expect(
      controller.adoptSession(
        { accessToken: 'garbage', refreshToken: 'rt' },
        res as unknown as import('express').Response,
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(res.cookies['icore_rt']).toBeUndefined();
    expect(res.cookies['icore_csrf']).toBeUndefined();
  });
});

describe('AuthController (gateway) — refresh', () => {
  it('rejects when the CSRF header does not match the CSRF cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(ForbiddenException);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('rejects when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: {},
      headers: {},
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('on success, calls refresh with the cookie token and re-issues both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    const result = await controller.refresh(req, res as unknown as import('express').Response);
    expect(client.refresh).toHaveBeenCalledWith('rt-1');
    // refreshToken: 'cookie' is a sentinel, NOT a real token — @idevconn/api-client's
    // doRefresh() hard-requires a string refreshTokenField in the response body
    // to treat the refresh as successful.
    expect(result).toEqual({
      accessToken: 'at',
      refreshToken: 'cookie',
      user: { id: 'u1', email: 'a@x.com' },
    });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });
});

describe('AuthController (gateway) — logout', () => {
  it('revokes the session using the refresh cookie and clears both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await controller.logout(req, res as unknown as import('express').Response);
    expect(client.revoke).toHaveBeenCalledWith('rt-1');
    expect(res.cookieCleared).toBe(true);
  });

  it('is idempotent when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = { cookies: {} } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.logout(req, res as unknown as import('express').Response),
    ).resolves.toEqual({ ok: true });
    expect(client.revoke).not.toHaveBeenCalled();
  });

  it('still clears cookies and returns ok when revoke rejects (MS/transport failure)', async () => {
    const client = makeAuthClient();
    (client.revoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('transport down'));
    const controller = new AuthController(client, makeConfig({}));
    const req = { cookies: { icore_rt: 'rt-1' } } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.logout(req, res as unknown as import('express').Response),
    ).resolves.toEqual({ ok: true });
    expect(client.revoke).toHaveBeenCalledWith('rt-1');
    expect(res.cookieCleared).toBe(true);
  });
});

describe('AuthController (gateway) — OAuth', () => {
  it('oauthStart sets a state cookie and redirects to the provider URL', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ API_ORIGIN: 'http://api' }));
    const res = makeRes();
    await controller.oauthStart('google', res as unknown as import('express').Response);
    expect(client.startOAuth).toHaveBeenCalledWith(
      'google',
      'http://api/api/auth/oauth/google/callback',
    );
    expect(res.cookies['oauth_state']).toBe('abc');
    expect(res.redirectedTo).toBe('https://provider.example.com/auth?state=abc');
  });

  it('oauthCallback rejects when cookie state does not match query state', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'right' } } as unknown as import('express').Request;
    await expect(
      controller.oauthCallback(
        'google',
        'code',
        'wrong',
        req,
        res as unknown as import('express').Response,
      ),
    ).rejects.toThrow();
  });

  it('oauthCallback exchanges, sets auth cookies, and redirects with accessToken only in the fragment', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as import('express').Request;
    await controller.oauthCallback(
      'google',
      'code-xyz',
      'abc',
      req,
      res as unknown as import('express').Response,
    );
    expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
    expect(res.cookieCleared).toBe(true);
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
    expect(res.redirectedTo).toContain('accessToken=at');
    expect(res.redirectedTo).not.toContain('refreshToken=');
  });

  it('oauthStart rejects unknown providers', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    await expect(
      controller.oauthStart('apple', res as unknown as import('express').Response),
    ).rejects.toThrow();
  });
});
