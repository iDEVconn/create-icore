import { createApiClient, type ApiClient } from '@idevconn/api-client';
import { readCsrfCookie } from './csrf.js';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }): ApiClient {
  const client = createApiClient({
    baseUrl: opts.baseUrl,
    credentials: 'include',
    // No access token, no client-driven refresh at all under the BFF model
    // -- the session cookie is the only credential, and AuthGuard refreshes
    // the provider token pair server-side, invisibly. api-client still
    // needs SOME truthy getAccessToken/getRefreshToken to not short-circuit
    // requests as unauthenticated; the session cookie is what actually
    // authenticates, these are just satisfying the client library's shape.
    getAccessToken: () => 'cookie',
    getRefreshToken: () => 'cookie',
    // Required by ApiClientConfig's shape, but under the BFF model the
    // internal refresh cycle never meaningfully succeeds (the client no
    // longer has a real /auth/refresh route to hit) -- a failed refresh
    // always falls through to onUnauthorized below, so this never fires.
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- required by ApiClientConfig, intentionally a no-op (see comment above)
    onTokenRefreshed: () => {},
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });

  // @idevconn/api-client's `getRefreshHeaders` config option only merges
  // headers into the library's own internal refresh request -- a route
  // (`/auth/refresh`) that no longer exists at all under the BFF model
  // (Task 5 deleted it). CsrfGuard (Task 6) protects every mutating route
  // globally now, not just refresh, so the CSRF double-submit header must
  // go out on every real request this app makes. The library exposes no
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
