import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyCsrf } from '@icore/shared';
import type { Request } from 'express';
import { SKIP_CSRF_KEY } from './skip-csrf.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF check on every mutating route.
 *
 * Exemptions are declared per-handler with `@SkipCsrf()` and read through the
 * `Reflector`, mirroring how `AuthGuard` reads `@Public()` — NOT by matching
 * request paths against a hardcoded allowlist, as this guard originally did.
 * A path allowlist silently rots: the first `@Public()` webhook route someone
 * adds would sail past `AuthGuard` and then 403 here for reasons that have
 * nothing to do with the route's own code. With metadata, exemption is a
 * visible property of the handler, and anything undecorated is protected by
 * default (fail-closed).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    if (!verifyCsrf(req)) throw new ForbiddenException('csrf_mismatch');
    return true;
  }
}
