import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const REFRESH_COOKIE = 'icore_rt';
const CSRF_COOKIE = 'icore_csrf';
// icore_rt is httpOnly and only ever needed on /api/auth/* requests (refresh, logout) -
// scope it narrowly so the browser never attaches it elsewhere.
const REFRESH_COOKIE_PATH = '/api/auth';
// icore_csrf is intentionally NOT httpOnly - client JS must read it via document.cookie
// from any SPA route (/, /login, /dashboard, ...) to attach the X-CSRF-Token header on
// refresh calls. Per RFC 6265, document.cookie only exposes cookies whose Path is a
// prefix of the current page's path, so this cookie must be scoped to '/'.
const CSRF_COOKIE_PATH = '/';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOptions(isProd: boolean, httpOnly: boolean, path: string) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function setAuthCookies(
  res: Response,
  opts: { refreshToken: string; csrfToken: string; isProd: boolean },
): void {
  // Storing the refresh token in an httpOnly, Secure (in prod), SameSite-scoped
  // cookie IS the fix this module exists for -- it replaces the localStorage
  // storage this repo used before. The cookie is never readable by client JS
  // (httpOnly) and only ever sent over TLS in prod (secure: true below); there
  // is nothing further to encrypt client-side without moving key management
  // server-side for no security benefit over the browser's own httpOnly
  // cookie jar protection.
  res.cookie(
    REFRESH_COOKIE,
    // codeql[js/clear-text-storage-of-sensitive-data]: see comment above -- httpOnly+Secure+SameSite cookie is the intended, OWASP-recommended protection, not clear-text storage.
    opts.refreshToken,
    cookieOptions(opts.isProd, true, REFRESH_COOKIE_PATH),
  );
  res.cookie(CSRF_COOKIE, opts.csrfToken, cookieOptions(opts.isProd, false, CSRF_COOKIE_PATH));
}

export function clearAuthCookies(res: Response, opts: { isProd: boolean }): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(opts.isProd, true, REFRESH_COOKIE_PATH));
  res.clearCookie(CSRF_COOKIE, cookieOptions(opts.isProd, false, CSRF_COOKIE_PATH));
}

export function readRefreshToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

export function verifyCsrf(req: Request): boolean {
  const cookieValue = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerValue = req.headers['x-csrf-token'];
  if (!cookieValue || !headerValue || typeof headerValue !== 'string') return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
