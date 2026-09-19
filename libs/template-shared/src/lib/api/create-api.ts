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
    // Response body is {accessToken, refreshToken: 'cookie', user} — the
    // gateway's refresh() returns a 'cookie' sentinel for refreshToken (the
    // real token never leaves the httpOnly cookie). @idevconn/api-client's
    // internal doRefresh() hard-requires a string refreshTokenField in the
    // response body to treat a refresh as successful, so this field must be
    // present even though its value is never read as a real token.
    accessTokenField: 'accessToken',
    refreshTokenField: 'refreshToken',
    onTokenRefreshed: ({ accessToken }) => setAccessToken(accessToken),
    onUnauthorized: () => {
      setAccessToken(null);
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
