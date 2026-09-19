import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

const REFRESH_COOKIE = 'icore_rt';
const CSRF_COOKIE = 'icore_csrf';
const COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOptions(isProd: boolean, httpOnly: boolean) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function setAuthCookies(
  res: Response,
  opts: { refreshToken: string; csrfToken: string; isProd: boolean },
): void {
  res.cookie(REFRESH_COOKIE, opts.refreshToken, cookieOptions(opts.isProd, true));
  res.cookie(CSRF_COOKIE, opts.csrfToken, cookieOptions(opts.isProd, false));
}

export function clearAuthCookies(res: Response, opts: { isProd: boolean }): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(opts.isProd, true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(opts.isProd, false));
}

export function readRefreshToken(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}

export function verifyCsrf(req: Request): boolean {
  const cookieValue = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const headerValue = req.headers['x-csrf-token'];
  if (!cookieValue || !headerValue || typeof headerValue !== 'string') return false;
  return cookieValue === headerValue;
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
