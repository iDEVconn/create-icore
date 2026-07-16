import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    // Gateway's AuthSession contract is camelCase end-to-end (accessToken /
    // refreshToken on both the /auth/refresh request body and response) —
    // override the client lib's snake_case defaults or the automatic refresh
    // silently no-ops and the user is force-logged-out at JWT_EXPIRES_IN.
    refreshRequestField: 'refreshToken',
    accessTokenField: 'accessToken',
    refreshTokenField: 'refreshToken',
    onTokenRefreshed: ({ accessToken, refreshToken }) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth({ accessToken, refreshToken, user });
    },
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
