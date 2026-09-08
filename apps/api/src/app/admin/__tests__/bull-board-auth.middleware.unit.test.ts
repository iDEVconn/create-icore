import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
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

function req(authorization?: string): Request {
  return { headers: { authorization } } as unknown as Request;
}

describe('BullBoardAuthMiddleware', () => {
  const makeMiddleware = (verify: () => Promise<unknown>) => {
    const client = { verify: vi.fn().mockImplementation(verify) };
    return { middleware: new BullBoardAuthMiddleware(client as never), client };
  };

  it('rejects with 401 when Authorization header is missing', async () => {
    const { middleware } = makeMiddleware(() => Promise.resolve({ role: 'admin' }));
    const next = vi.fn();
    const response = res();
    await middleware.use(req(undefined), response, next);
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when scheme is not Bearer', async () => {
    const { middleware } = makeMiddleware(() => Promise.resolve({ role: 'admin' }));
    const next = vi.fn();
    const response = res();
    await middleware.use(req('Basic abc'), response, next);
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails', async () => {
    const { middleware } = makeMiddleware(() => Promise.reject(new Error('bad')));
    const next = vi.fn();
    const response = res();
    await middleware.use(req('Bearer abc'), response, next);
    expect(response.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the verified user is not an admin', async () => {
    const { middleware } = makeMiddleware(() => Promise.resolve({ uid: 'u1', role: 'user' }));
    const next = vi.fn();
    const response = res();
    await middleware.use(req('Bearer abc'), response, next);
    expect(response.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when the verified user has the admin role', async () => {
    const { middleware } = makeMiddleware(() => Promise.resolve({ uid: 'u1', role: 'admin' }));
    const next = vi.fn();
    const response = res();
    await middleware.use(req('Bearer abc'), response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(0);
  });
});
