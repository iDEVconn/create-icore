// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const innerClient = vi.fn();

vi.mock('@idevconn/api-client', async () => {
  const actual =
    await vi.importActual<typeof import('@idevconn/api-client')>('@idevconn/api-client');
  return { ...actual, createApiClient: vi.fn(() => innerClient) };
});

import { createApiClient } from '@idevconn/api-client';
import { createIcoreApi } from '../create-api';

function clearCsrfCookie() {
  document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
}

describe('createIcoreApi', () => {
  afterEach(() => {
    clearCsrfCookie();
    innerClient.mockReset();
  });

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

  // Regression: @idevconn/api-client's `getRefreshHeaders` only merges
  // headers into its own internal refresh call (a route that no longer
  // exists under the BFF model). CsrfGuard protects every mutating route
  // now, so the returned api function must attach X-CSRF-Token itself on
  // every real request it forwards to the underlying client.
  describe('CSRF header attachment on every request (not just refresh)', () => {
    it('attaches X-CSRF-Token when the icore_csrf cookie is present', async () => {
      document.cookie = 'icore_csrf=csrf-abc';
      innerClient.mockResolvedValueOnce({ ok: true });

      const api = createIcoreApi({ baseUrl: '/api' });
      await api('/notes', { method: 'POST', body: '{}' });

      expect(innerClient).toHaveBeenCalledTimes(1);
      const [path, options] = innerClient.mock.calls[0] as [string, RequestInit];
      expect(path).toBe('/notes');
      expect(new Headers(options.headers).get('X-CSRF-Token')).toBe('csrf-abc');
      // Original request options are preserved alongside the added header.
      expect(options.method).toBe('POST');
      expect(options.body).toBe('{}');
    });

    it('sends no X-CSRF-Token header when the cookie is absent', async () => {
      clearCsrfCookie();
      innerClient.mockResolvedValueOnce({ ok: true });

      const api = createIcoreApi({ baseUrl: '/api' });
      await api('/notes', { method: 'GET' });

      const [, options] = innerClient.mock.calls[0] as [string, RequestInit];
      expect(new Headers(options.headers).has('X-CSRF-Token')).toBe(false);
    });

    it('preserves caller-supplied headers alongside the injected CSRF header', async () => {
      document.cookie = 'icore_csrf=csrf-xyz';
      innerClient.mockResolvedValueOnce({ ok: true });

      const api = createIcoreApi({ baseUrl: '/api' });
      await api('/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const [, options] = innerClient.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(options.headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-CSRF-Token')).toBe('csrf-xyz');
    });
  });
});
