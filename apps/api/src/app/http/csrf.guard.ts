import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { verifyCsrf } from '@icore/shared';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    // Public, cookie-free auth routes (login/register/magic-link/oauth/
    // session-adopt) issue the very cookies CSRF protection depends on --
    // they cannot require a CSRF token that doesn't exist yet. logout is
    // Public too but DOES already have cookies from an active session;
    // still exempt it deliberately -- a forged logout is a minor
    // availability nuisance, not a security compromise, and exempting it
    // avoids a chicken-and-egg failure mode for any client that lost its
    // CSRF cookie but still holds a session cookie.
    if (req.path.startsWith('/api/auth/')) return true;
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    return true;
  }
}
