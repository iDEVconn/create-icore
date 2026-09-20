import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { clearSessionCookie, readSessionId, setSessionCookie } from '../session-cookie';

function mockRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('session-cookie', () => {
  it('setSessionCookie sets icore_sid as httpOnly', () => {
    const res = mockRes();
    setSessionCookie(res, 'sid-1', false);
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_sid',
      'sid-1',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('readSessionId reads the cookie value', () => {
    const req = { cookies: { icore_sid: 'sid-1' } } as unknown as Request;
    expect(readSessionId(req)).toBe('sid-1');
  });

  it('readSessionId returns undefined when absent', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(readSessionId(req)).toBeUndefined();
  });

  it('clearSessionCookie clears icore_sid', () => {
    const res = mockRes();
    clearSessionCookie(res, true);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'icore_sid',
      expect.objectContaining({ secure: true }),
    );
  });
});
