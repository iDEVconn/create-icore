import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
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
}

export { ApiError } from '@idevconn/api-client';
