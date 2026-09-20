import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { FakeSessionStore, type SessionStore } from '@icore/shared';
import { BullBoardAuthMiddleware } from '../bull-board-auth.middleware';

function res() {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      r.statusCode = code;
      return r;
    },
    json(body: unknown) {
      r.body = body;
      return r;
    },
  };
  return r as unknown as Response & { statusCode: number; body: unknown };
}

function req(
  cookies: Record<string, string> = {},
  method = 'GET',
  headers: Record<string, string> = {},
): Request {
  return { cookies, method, headers } as unknown as Request;
}

async function seed(store: SessionStore, role?: string): Promise<string> {
  const record = await store.create({
    uid: 'u1',
    email: 'a@b.com',
    role,
    providerAccessToken: 'at1',
    providerRefreshToken: 'rt1',
    providerAccessTokenExpiresAt: Date.now() + 3600_000,
  });
  return record.sessionId;
}

describe('BullBoardAuthMiddleware', () => {
  it('rejects with 401 when there is no session cookie', async () => {
    const middleware = new BullBoardAuthMiddleware(new FakeSessionStore());
    const next = vi.fn();
    const response = res();
    await middleware.use(req(), response, next);
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the session id is unknown to the store', async () => {
    const middleware = new BullBoardAuthMiddleware(new FakeSessionStore());
    const next = vi.fn();
    const response = res();
    await middleware.use(req({ icore_sid: 'nope' }), response, next);
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the session belongs to a non-admin', async () => {
    const store = new FakeSessionStore();
    const sessionId = await seed(store, 'user');
    const middleware = new BullBoardAuthMiddleware(store);
    const next = vi.fn();
    const response = res();
    await middleware.use(req({ icore_sid: sessionId }), response, next);
    expect(response.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the session has no role at all', async () => {
    const store = new FakeSessionStore();
    const sessionId = await seed(store);
    const middleware = new BullBoardAuthMiddleware(store);
    const next = vi.fn();
    const response = res();
    await middleware.use(req({ icore_sid: sessionId }), response, next);
    expect(response.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for an admin session cookie — no Authorization header needed', async () => {
    const store = new FakeSessionStore();
    const sessionId = await seed(store, 'admin');
    const middleware = new BullBoardAuthMiddleware(store);
    const next = vi.fn();
    const response = res();
    await middleware.use(req({ icore_sid: sessionId }), response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(0);
  });

  it('answers 503 (not 401) when the session store itself is unavailable', async () => {
    const broken = {
      get: vi.fn().mockRejectedValue(new Error('Connection is closed')),
    } as unknown as SessionStore;
    const middleware = new BullBoardAuthMiddleware(broken);
    const next = vi.fn();
    const response = res();
    await middleware.use(req({ icore_sid: 'sid' }), response, next);
    expect(response.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  // Cookie auth made the board's mutating endpoints CSRF-able, and the global
  // CsrfGuard cannot reach a raw Express router. Origin is the fallback.
  it('rejects a cross-origin mutating request even with a valid admin session', async () => {
    const store = new FakeSessionStore();
    const sessionId = await seed(store, 'admin');
    const middleware = new BullBoardAuthMiddleware(store);
    const next = vi.fn();
    const response = res();
    await middleware.use(
      req({ icore_sid: sessionId }, 'POST', { origin: 'https://evil.example', host: 'api.app' }),
      response,
      next,
    );
    expect(response.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a same-origin mutating request from the board UI itself', async () => {
    const store = new FakeSessionStore();
    const sessionId = await seed(store, 'admin');
    const middleware = new BullBoardAuthMiddleware(store);
    const next = vi.fn();
    const response = res();
    await middleware.use(
      req({ icore_sid: sessionId }, 'POST', { origin: 'https://api.app', host: 'api.app' }),
      response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(0);
  });
});
