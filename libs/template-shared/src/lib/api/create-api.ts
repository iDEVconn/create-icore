import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store.js';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
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
