// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIcoreApi } from '../create-api';

// Real @idevconn/api-client (not mocked): proves a 401 goes straight to onUnauthorized
// without a POST /auth/refresh round trip (the gateway has no such route -> it 404ed first).
describe('createIcoreApi on 401', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls onUnauthorized without hitting any refresh endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();

    const api = createIcoreApi({ baseUrl: '/api', onUnauthorized });
    await expect(api('/notes')).rejects.toMatchObject({ status: 401 });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/notes');
  });
});
