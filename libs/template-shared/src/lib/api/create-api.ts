import { createApiClient } from '@idevconn/api-client';
import { getAccessToken, setAccessToken } from './access-token.js';
import { readCsrfCookie } from './csrf.js';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    getAccessToken: () => getAccessToken(),
    getRefreshToken: () => 'cookie', // real token lives only in the httpOnly cookie; this is just a truthy guard
    getRefreshHeaders: (): Record<string, string> => {
      const csrf = readCsrfCookie();
      return csrf ? { 'X-CSRF-Token': csrf } : {};
    },
    // Response body is now {accessToken, user} only — no refreshToken field
    // (Task 4/5/7 drop it everywhere) — refreshRequestField/refreshTokenField
    // no longer apply.
    accessTokenField: 'accessToken',
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
