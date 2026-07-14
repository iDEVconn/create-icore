import { describe, expect, it, vi } from 'vitest';

vi.mock('@idevconn/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
  return { ...actual, createApiClient: vi.fn(() => vi.fn()) };
});

import { createApiClient } from '@idevconn/api-client';
import { createIcoreApi } from '../create-api';

describe('createIcoreApi', () => {
  it('overrides the token field names to match the gateway camelCase AuthSession contract', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshRequestField: 'refreshToken',
        accessTokenField: 'accessToken',
        refreshTokenField: 'refreshToken',
      }),
    );
  });
});
