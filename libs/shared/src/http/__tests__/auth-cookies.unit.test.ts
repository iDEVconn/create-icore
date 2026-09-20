import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { verifyCsrf, generateCsrfToken } from '../auth-cookies';

describe('verifyCsrf', () => {
  it('returns true when the header matches the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(true);
  });

  it('returns false when the header does not match the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });

  it('returns false when either is missing', () => {
    const req = { cookies: {}, headers: {} } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });
});

describe('generateCsrfToken', () => {
  it('returns a non-empty random string, different each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
