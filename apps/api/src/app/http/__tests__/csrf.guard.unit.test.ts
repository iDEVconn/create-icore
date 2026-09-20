import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { CsrfGuard } from '../csrf.guard';
import { SkipCsrf } from '../skip-csrf.decorator';
import { AuthController } from '../../auth/auth.controller';

// Contexts are built around the REAL controller handlers, not path strings:
// the guard now answers "is this route exempt?" from @SkipCsrf() metadata, so
// the test proves the decorators are actually on the handlers that need them.
function ctxFor(
  method: string,
  handler: object,
  cls: object,
  cookies: Record<string, string> = {},
  headers: Record<string, string> = {},
): ExecutionContext {
  const req = { method, cookies, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

class UnrelatedController {
  mutate() {
    return null;
  }
}

class WebhookController {
  @SkipCsrf()
  handle() {
    return null;
  }
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard(new Reflector());
  const notes = () => ctxFor('POST', UnrelatedController.prototype.mutate, UnrelatedController);

  it('allows GET regardless of CSRF headers', () => {
    expect(
      guard.canActivate(ctxFor('GET', UnrelatedController.prototype.mutate, UnrelatedController)),
    ).toBe(true);
  });

  it('rejects a mutating non-auth route with no CSRF cookie/header', () => {
    expect(() => guard.canActivate(notes())).toThrow(ForbiddenException);
  });

  it('rejects a mismatched CSRF cookie/header pair', () => {
    expect(() =>
      guard.canActivate(
        ctxFor(
          'POST',
          UnrelatedController.prototype.mutate,
          UnrelatedController,
          { icore_csrf: 'a' },
          { 'x-csrf-token': 'b' },
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a matching CSRF cookie/header pair', () => {
    expect(
      guard.canActivate(
        ctxFor(
          'POST',
          UnrelatedController.prototype.mutate,
          UnrelatedController,
          { icore_csrf: 'same' },
          { 'x-csrf-token': 'same' },
        ),
      ),
    ).toBe(true);
  });

  it('allows DELETE with a matching pair (not just POST)', () => {
    expect(
      guard.canActivate(
        ctxFor(
          'DELETE',
          UnrelatedController.prototype.mutate,
          UnrelatedController,
          { icore_csrf: 'same' },
          { 'x-csrf-token': 'same' },
        ),
      ),
    ).toBe(true);
  });

  // Exactly the set the old hardcoded path allowlist covered — asserted
  // against the real handlers so a decorator dropped in a future refactor
  // fails here instead of breaking login in production.
  it.each([
    ['login', AuthController.prototype.login],
    ['register', AuthController.prototype.register],
    ['logout', AuthController.prototype.logout],
    ['magic-link request', AuthController.prototype.requestMagicLink],
    ['magic-link verify', AuthController.prototype.verifyMagicLink],
    ['session/adopt', AuthController.prototype.adoptSession],
    ['oauth start', AuthController.prototype.oauthStart],
    ['oauth callback', AuthController.prototype.oauthCallback],
  ])('allows %s without a CSRF token (@SkipCsrf)', (_name, handler) => {
    expect(guard.canActivate(ctxFor('POST', handler, AuthController))).toBe(true);
  });

  it('still protects the admin revoke-user route (not @SkipCsrf, same controller)', () => {
    expect(() =>
      guard.canActivate(ctxFor('POST', AuthController.prototype.revokeUser, AuthController)),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(
        ctxFor(
          'POST',
          AuthController.prototype.revokeUser,
          AuthController,
          { icore_csrf: 'same' },
          { 'x-csrf-token': 'same' },
        ),
      ),
    ).toBe(true);
  });

  // The reason for the decorator: a future @Public() webhook opts out
  // explicitly instead of silently 403ing because its path isn't in a list
  // nobody remembers to update.
  it('exempts any handler that opts in with @SkipCsrf, not just auth paths', () => {
    expect(
      guard.canActivate(ctxFor('POST', WebhookController.prototype.handle, WebhookController)),
    ).toBe(true);
  });
});
