// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performSilentRefresh } from '../silent-refresh';

const BASE = 'http://test/api';

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('performSilentRefresh', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    document.cookie = 'icore_csrf=csrf-abc';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
  });

  it('sends credentials and the CSRF header, returns the session on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } }),
    );

    const result = await performSilentRefresh(BASE);

    expect(result).toEqual({ accessToken: 'fresh', user: { id: 'u1', email: 'u@x.com' } });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- fetchMock's call is asserted present by the assertion above
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/auth/refresh`);
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('csrf-abc');
  });

  it('returns null on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('returns null on a network failure', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await performSilentRefresh(BASE)).toBeNull();
  });

  it('serializes two concurrent calls through navigator.locks when available', async () => {
    const lockRequest = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request: lockRequest } });

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'a', user: { id: 'u1', email: 'e' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'b', user: { id: 'u1', email: 'e' } }),
      );

    await Promise.all([performSilentRefresh(BASE), performSilentRefresh(BASE)]);

    expect(lockRequest).toHaveBeenCalledTimes(2);
  });
});
