import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { print } from 'graphql';
import { api } from '../../main';
import { GetMe } from '../../graphql/profile.queries';
import { useProfile, useUpdateProfile } from '../profile.gql-api';

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../main', () => ({ api: vi.fn() }));
vi.mock('@icore/template-shared', () => ({ useNotify: () => notify }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { Wrapper, invalidate };
}

describe('profile queries (GraphQL)', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    notify.success.mockReset();
    notify.error.mockReset();
  });

  it('useProfile sends GetMe and returns me (role may be null)', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      data: { me: { uid: 'u1', email: 'a@b.c', role: null } },
    });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, init] = vi.mocked(api).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/graphql');
    expect(JSON.parse(init.body as string)).toEqual({
      query: print(GetMe),
      operationName: 'GetMe',
    });
    expect(result.current.data).toEqual({ uid: 'u1', email: 'a@b.c', role: null });
  });

  it('useUpdateProfile keeps the REST request (the schema has no profile mutation), notifies and invalidates ["profile"]', async () => {
    vi.mocked(api).mockResolvedValueOnce({});
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Wrapper });
    const onSuccess = vi.fn();
    result.current.mutate('Ann', { onSuccess });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api).toHaveBeenCalledWith('/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ann' }),
    });
    expect(notify.success).toHaveBeenCalledWith('Saved');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile'] });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('useUpdateProfile reports the error message on failure', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('boom'));
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Wrapper });
    result.current.mutate('Ann');
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notify.error).toHaveBeenCalledWith('boom');
  });
});
