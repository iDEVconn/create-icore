import { createD1RestClient, D1ApiError } from '../d1-client';

const URL_ = 'https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query';

const ok = (results: unknown[], changes = 0) =>
  new Response(
    JSON.stringify({ success: true, errors: [], result: [{ results, meta: { changes } }] }),
    {
      status: 200,
    },
  );

const fail = (status: number, codes: number[], headers: Record<string, string> = {}) =>
  new Response(
    JSON.stringify({
      success: false,
      errors: codes.map((code) => ({ code, message: 'x' })),
      result: [],
    }),
    { status, headers },
  );

const make = (fetchFn: typeof fetch, extra: Record<string, unknown> = {}) => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  const client = createD1RestClient({
    accountId: 'acc',
    databaseId: 'db',
    apiToken: 'tok',
    fetch: fetchFn,
    sleep,
    ...extra,
  });
  return { client, sleep };
};

describe('createD1RestClient', () => {
  it('posts sql and params to the account/database query URL with a Bearer token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok([]));
    const { client } = make(fetchFn);
    await client.query('SELECT ?', ['a']);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ sql: 'SELECT ?', params: ['a'] });
  });

  it('returns rows and changes from result[0].results and result[0].meta.changes', async () => {
    const { client } = make(vi.fn().mockResolvedValue(ok([{ id: '1' }], 3)));
    expect(await client.query('x')).toEqual({ rows: [{ id: '1' }], changes: 3 });
  });

  it('throws D1ApiError with status and Cloudflare error codes on success:false', async () => {
    const { client } = make(vi.fn().mockResolvedValue(fail(400, [7500, 7501])));
    const err = await client.query('x').catch((e) => e);
    expect(err).toBeInstanceOf(D1ApiError);
    expect(err.status).toBe(400);
    expect(err.codes).toEqual([7500, 7501]);
  });

  it.each([400, 401, 403, 500])('does not retry a %i', async (status) => {
    const fetchFn = vi.fn().mockResolvedValue(fail(status, [1]));
    const { client, sleep } = make(fetchFn);
    await expect(client.query('x')).rejects.toBeInstanceOf(D1ApiError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries 429 then succeeds, honouring Retry-After', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fail(429, [971], { 'Retry-After': '1' }))
      .mockResolvedValueOnce(ok([{ a: 1 }]));
    const { client, sleep } = make(fetchFn);
    expect((await client.query('x')).rows).toEqual([{ a: 1 }]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('gives up after maxRetries and throws D1ApiError', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => fail(503, [1]));
    const { client } = make(fetchFn);
    const err = await client.query('x').catch((e) => e);
    expect(err).toBeInstanceOf(D1ApiError);
    expect(err.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries a pre-response network error then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(ok([]));
    const { client } = make(fetchFn);
    await expect(client.query('x')).resolves.toEqual({ rows: [], changes: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a 200 response with a non-JSON body instead of reporting success', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>oops', { status: 200 }));
    const { client } = make(fetchFn);
    const err = await client.query('x').catch((e) => e);
    expect(err).toBeInstanceOf(D1ApiError);
    expect(err.status).toBe(200);
  });

  it('aborts on timeout without retrying', async () => {
    const fetchFn = vi.fn(
      (_u: unknown, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(init.signal?.reason));
        }),
    );
    const { client, sleep } = make(fetchFn as unknown as typeof fetch, { timeoutMs: 20 });
    const err = await client.query('x').catch((e) => e);
    expect(['TimeoutError', 'AbortError']).toContain(err.name);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
