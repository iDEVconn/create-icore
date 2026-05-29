import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { AuthClientService } from '@icore/auth-client';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function makeAuthClient(): AuthClientService {
  return {
    signup: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
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

  it('verifyMagicLink forwards the token + returns the session', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const session = await controller.verifyMagicLink({ token: 'tok' });
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session.user.email).toBe('a@x.com');
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

  it('oauthCallback exchanges + redirects to the client with a fragment', async () => {
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
    expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
    expect(res.redirectedTo).toContain('accessToken=at');
    expect(res.redirectedTo).toContain('refreshToken=rt');
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
