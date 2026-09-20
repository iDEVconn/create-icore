import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'skipCsrf';

/**
 * Exempts a route from the global `CsrfGuard`.
 *
 * Deliberately SEPARATE from `@Public()`: "no session required" and "no CSRF
 * token required" are different questions. A route that issues the CSRF
 * cookie itself (login/register/session-adopt) cannot present one yet, and a
 * provider webhook has no browser cookie jar at all — but `logout` is
 * `@Public()` AND exempt while `POST /auth/admin/revoke-user/:uid` is neither.
 * Making a route `@Public()` must never silently drop CSRF protection, so the
 * guard reads this key, not `IS_PUBLIC_KEY`.
 */
export const SkipCsrf = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_CSRF_KEY, true);
