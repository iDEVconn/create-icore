import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { verifyCsrf } from '@icore/shared';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Exact-match auth routes that genuinely cannot present a CSRF token yet --
// login/register/session-adopt issue the very cookies CSRF protection
// depends on, and logout (Public but DOES already have cookies from an
// active session) is exempted deliberately: a forged logout is a minor
// availability nuisance, not a security compromise, and exempting it avoids
// a chicken-and-egg failure mode for any client that lost its CSRF cookie
// but still holds a session cookie.
const PUBLIC_AUTH_EXACT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/session/adopt',
]);

// Prefix-match auth routes -- magic-link covers both the request route and
// its /verify sibling; oauth covers both the start route and its
// /:provider/callback sibling. Deliberately narrow (not a blanket
// `/api/auth/` prefix) so that other, non-public auth routes -- e.g.
// `/api/auth/admin/revoke-user/:uid` -- fall through to the normal
// verifyCsrf check below instead of being silently exempted.
const PUBLIC_AUTH_PATH_PREFIXES = ['/api/auth/magic-link', '/api/auth/oauth/'];

function isPublicAuthPath(path: string): boolean {
  if (PUBLIC_AUTH_EXACT_PATHS.has(path)) return true;
  return PUBLIC_AUTH_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (isPublicAuthPath(req.path)) return true;
    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    return true;
  }
}
