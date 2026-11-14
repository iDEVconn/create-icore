import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '../../main';
import { useProfile, useUpdateProfile } from '../profile';

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

describe('profile queries (REST)', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    notify.success.mockReset();
    notify.error.mockReset();
  });

  it('useProfile GETs /profile', async () => {
    vi.mocked(api).mockResolvedValueOnce({ uid: 'u1', email: 'a@b.c', role: 'admin' });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api).toHaveBeenCalledWith('/profile');
    expect(result.current.data).toEqual({ uid: 'u1', email: 'a@b.c', role: 'admin' });
  });

  it('useUpdateProfile PATCHes /profile with {name}, notifies and invalidates', async () => {
    vi.mocked(api).mockResolvedValueOnce({});
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Wrapper });
    result.current.mutate('Ann');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api).toHaveBeenCalledWith('/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ann' }),
    });
    expect(notify.success).toHaveBeenCalledWith('Saved');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile'] });
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
