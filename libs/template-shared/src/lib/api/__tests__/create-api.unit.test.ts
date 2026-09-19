// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('declares refreshTokenField so the real library accepts the gateway response shape', () => {
    createIcoreApi({ baseUrl: '/api' });

    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshTokenField: 'refreshToken',
      }),
    );
  });
});

// Regression for C1: the mocked createApiClient above proves config *shape* only —
// it cannot catch a contract mismatch with the real library's internal doRefresh(),
// which hard-requires a string refreshTokenField in the refresh response body.
// This suite exercises the REAL @idevconn/api-client against a mocked fetch.
describe('createIcoreApi — real @idevconn/api-client 401 -> refresh -> retry cycle', () => {
  function mockResponse(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }

  beforeEach(() => {
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  afterEach(() => {
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
    vi.unstubAllGlobals();
    vi.doMock('@idevconn/api-client', async () => {
      const actual =
        await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
      return { ...actual, createApiClient: vi.fn(() => vi.fn()) };
    });
  });

  it('refreshes using the real library and updates the in-memory access token on {accessToken, refreshToken: "cookie", user}', async () => {
    vi.resetModules();
    vi.doUnmock('@idevconn/api-client');
    document.cookie = 'icore_csrf=csrf-abc';

    const { createIcoreApi: realCreateIcoreApi } = await import('../create-api');
    const { setAccessToken, getAccessToken } = await import('../access-token');

    setAccessToken('expired-token');

    const fetchMock = vi
      .fn()
      // 1) original request — 401 with the (now expired) access token attached
      .mockResolvedValueOnce(mockResponse(401, null))
      // 2) POST /auth/refresh — gateway's real response shape post-fix
      .mockResolvedValueOnce(
        mockResponse(200, {
          accessToken: 'new-token',
          refreshToken: 'cookie',
          user: { id: 'u1', email: 'a@x.com' },
        }),
      )
      // 3) retried original request with the new access token
      .mockResolvedValueOnce(mockResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const api = realCreateIcoreApi({ baseUrl: 'http://localhost/api' });
    const result = await api('/notes');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The refresh call carried the CSRF header and the sentinel refresh token.
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toBe('http://localhost/api/auth/refresh');
    const refreshInit = refreshCall[1] as RequestInit;
    expect((refreshInit.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-abc');
    expect(refreshInit.body).toBe(JSON.stringify({ refresh_token: 'cookie' }));

    // The retried request used the freshly refreshed access token.
    const retryCall = fetchMock.mock.calls[2];
    const retryHeaders = retryCall[1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');

    // onTokenRefreshed actually fired with the access token (observable via the
    // in-memory access-token store it writes through to).
    expect(getAccessToken()).toBe('new-token');
  });
});
