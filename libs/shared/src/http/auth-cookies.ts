import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const CSRF_COOKIE = 'icore_csrf';

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
