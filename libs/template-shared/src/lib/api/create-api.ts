import { createApiClient, type ApiClient } from '@idevconn/api-client';
import { readCsrfCookie } from './csrf.js';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }): ApiClient {
  const client = createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    // Cookie-session (BFF) model: the session cookie is the only credential and AuthGuard refreshes
    // the provider token pair server-side, so the client has nothing to refresh. api-client only
    // treats a 401 as "unauthenticated" when getAccessToken() is truthy, hence the 'cookie'
    // placeholder. getRefreshToken() is null on purpose: api-client then skips its refresh call
    // (the gateway has no POST /auth/refresh -- it used to 404 before every redirect) and goes
    // straight to onUnauthorized below.
    getAccessToken: () => 'cookie',
    getRefreshToken: () => null,
    // Required by ApiClientConfig's shape; never called because there is no refresh token.
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- required by ApiClientConfig, intentionally a no-op (see comment above)
    onTokenRefreshed: () => {},
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });

  // CsrfGuard protects every mutating route globally, so the CSRF
  // double-submit header must go out on every real request this app makes. The library exposes no
  // per-request header hook, so we wrap the client it returns and attach
  // the header here instead. Safe methods (GET/HEAD/OPTIONS) don't need it
  // -- CsrfGuard already skips those -- but sending it anyway is harmless.
  return function icoreApiWithCsrf<T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const csrf = readCsrfCookie();
    const headers = new Headers(options.headers);
    if (csrf) headers.set('X-CSRF-Token', csrf);
    return client<T>(path, { ...options, headers });
  };
}

export { ApiError } from '@idevconn/api-client';
