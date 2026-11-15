import { describe, expect, it, vi, beforeEach } from 'vitest';
import { parse, print } from 'graphql';
import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ApiError } from '@idevconn/api-client';
import { api } from '../../main';
import { request } from '../graphql';

vi.mock('../../main', () => ({ api: vi.fn() }));

const ListNotes = parse(
  'query ListNotes($limit: Int, $offset: Int) { notes(limit: $limit, offset: $offset) { total } }',
) as TypedDocumentNode<{ notes: { total: number } }, { limit?: number; offset?: number }>;

function sentBody(): { query: string; variables?: unknown; operationName?: string } {
  const [, init] = vi.mocked(api).mock.calls[0] as [string, RequestInit];
  return JSON.parse(init.body as string) as {
    query: string;
    variables?: unknown;
    operationName?: string;
  };
}

describe('request (GraphQL over the shared api client)', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('POSTs /graphql and unwraps data', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { notes: { total: 3 } } });
    await expect(request(ListNotes, { limit: 10, offset: 0 })).resolves.toEqual({
      notes: { total: 3 },
    });
    expect(api).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(api).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/graphql');
    expect(init.method).toBe('POST');
  });

  it('sends the printed query, the variables and the operationName', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { notes: { total: 0 } } });
    await request(ListNotes, { limit: 5, offset: 10 });
    expect(sentBody()).toEqual({
      query: print(ListNotes),
      variables: { limit: 5, offset: 10 },
      operationName: 'ListNotes',
    });
  });

  it('throws an ApiError (status 200, body = errors) when errors is non-empty', async () => {
    const errors = [{ message: 'Forbidden resource', extensions: { code: 'FORBIDDEN' } }];
    vi.mocked(api).mockResolvedValueOnce({ data: null, errors });
    const failure = request(ListNotes, { limit: 1, offset: 0 });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 200,
      body: errors,
      message: 'Forbidden resource',
    });
  });

  it('throws when the response carries no data', async () => {
    vi.mocked(api).mockResolvedValueOnce({});
    await expect(request(ListNotes)).rejects.toBeInstanceOf(ApiError);
  });
});
