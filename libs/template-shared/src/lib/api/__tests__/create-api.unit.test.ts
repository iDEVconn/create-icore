// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('@idevconn/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
  return { ...actual, createApiClient: vi.fn(() => vi.fn()) };
});

import { createApiClient } from '@idevconn/api-client';
import { createIcoreApi } from '../create-api';

describe('createIcoreApi', () => {
  it('sends credentials so the session cookie rides along on every request', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: '/api',
        credentials: 'include',
      }),
    );
  });

  it('provides truthy getAccessToken/getRefreshToken so api-client never short-circuits as unauthenticated — the cookie, not these, is what actually authenticates', () => {
    createIcoreApi({ baseUrl: '/api' });

    const config = vi.mocked(createApiClient).mock.calls[0]?.[0];
    expect(config?.getAccessToken()).toBe('cookie');
    expect(config?.getRefreshToken()).toBe('cookie');
  });

  it('logs out and invokes the caller-supplied onUnauthorized hook on 401', () => {
    const onUnauthorized = vi.fn();
    createIcoreApi({ baseUrl: '/api', onUnauthorized });

    const config = vi.mocked(createApiClient).mock.calls[0]?.[0];
    config?.onUnauthorized();

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
