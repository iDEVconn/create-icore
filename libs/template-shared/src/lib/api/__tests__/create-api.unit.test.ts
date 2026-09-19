import { describe, expect, it, vi } from 'vitest';

vi.mock('@idevconn/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
  return { ...actual, createApiClient: vi.fn(() => vi.fn()) };
});

import { createApiClient } from '@idevconn/api-client';
import { createIcoreApi } from '../create-api';

describe('createIcoreApi', () => {
  it('overrides the access token field name to match the gateway camelCase AuthSession contract', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTokenField: 'accessToken',
      }),
    );
  });

  it('sends credentials and a CSRF refresh header, sourced from the in-memory token + cookie', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: 'include',
        getAccessToken: expect.any(Function),
        getRefreshToken: expect.any(Function),
        getRefreshHeaders: expect.any(Function),
      }),
    );
  });
});
