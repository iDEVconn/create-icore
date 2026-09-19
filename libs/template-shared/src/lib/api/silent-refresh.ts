import { readCsrfCookie } from './csrf.js';
import { setAccessToken } from './access-token.js';

interface SilentRefreshResult {
  accessToken: string;
  user: { id: string; email: string };
}

async function doRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const csrf = readCsrfCookie();
  try {
    const res = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<SilentRefreshResult>;
    if (typeof data.accessToken !== 'string' || !data.user) return null;
    return { accessToken: data.accessToken, user: data.user };
  } catch {
    return null;
  }
}

/**
 * Serializes the actual refresh network call across browser tabs via the
 * Web Locks API. The refresh token itself is never held in JS — only in the
 * httpOnly cookie the browser manages — so a tab that waited for the lock
 * sends whatever cookie value is current by the time it runs, not a stale
 * one it cached itself. Falls back to an unguarded call where Web Locks
 * isn't available (pre-15.4 Safari): the rare cross-tab race in that one
 * case is an accepted edge case, not worth a polyfill.
 */
export async function performSilentRefresh(baseUrl: string): Promise<SilentRefreshResult | null> {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  const result = locks
    ? await locks.request('icore-auth-refresh', () => doRefresh(baseUrl))
    : await doRefresh(baseUrl);
  if (result) setAccessToken(result.accessToken);
  return result;
}
