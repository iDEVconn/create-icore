import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CsrfGuard } from '../csrf.guard';

function ctxFor(
  method: string,
  path: string,
  cookies: Record<string, string>,
  headers: Record<string, string>,
): ExecutionContext {
  const req = { method, path, cookies, headers };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows GET regardless of CSRF headers', () => {
    expect(guard.canActivate(ctxFor('GET', '/api/notes', {}, {}))).toBe(true);
  });

  it('allows auth routes without a CSRF token', () => {
    expect(guard.canActivate(ctxFor('POST', '/api/auth/login', {}, {}))).toBe(true);
  });

  it('rejects a mutating non-auth route with no CSRF cookie/header', () => {
    expect(() => guard.canActivate(ctxFor('POST', '/api/notes', {}, {}))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a mismatched CSRF cookie/header pair', () => {
    expect(() =>
      guard.canActivate(ctxFor('POST', '/api/notes', { icore_csrf: 'a' }, { 'x-csrf-token': 'b' })),
    ).toThrow(ForbiddenException);
  });

  it('allows a matching CSRF cookie/header pair', () => {
    expect(
      guard.canActivate(
        ctxFor('POST', '/api/notes', { icore_csrf: 'same' }, { 'x-csrf-token': 'same' }),
      ),
    ).toBe(true);
  });

  it('allows DELETE with a matching pair (not just POST)', () => {
    expect(
      guard.canActivate(
        ctxFor('DELETE', '/api/notes/1', { icore_csrf: 'same' }, { 'x-csrf-token': 'same' }),
      ),
    ).toBe(true);
  });
});
