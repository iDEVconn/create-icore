import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { print } from 'graphql';
import { api } from '../../main';
import { CreateNote, DeleteNote, ListNotes, UpdateNote } from '../../graphql/notes.queries';
import { useCreateNote, useDeleteNote, useNotesList, useUpdateNote } from '../notes.graphql';

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../main', () => ({ api: vi.fn() }));
vi.mock('@icore/template-shared', () => ({ useNotify: () => notify }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const note = {
  id: 'n1',
  ownerId: 'u1',
  title: 'T',
  body: 'B',
  createdAt: '2026-11-14T00:00:00.000Z',
  updatedAt: '2026-11-14T00:00:00.000Z',
};

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { Wrapper, invalidate };
}

function sent(call = 0): [string, { query: string; variables: unknown; operationName: string }] {
  const [path, init] = vi.mocked(api).mock.calls[call] as [string, RequestInit];
  return [path, JSON.parse(init.body as string)];
}

describe('notes queries (GraphQL)', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    notify.success.mockReset();
    notify.error.mockReset();
  });

  it('useNotesList sends ListNotes with {limit, offset} and returns {items, total}', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { notes: { items: [note], total: 1 } } });
    const { Wrapper } = wrapper();
    const { result } = renderHook(() => useNotesList(20, 40), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, body] = sent();
    expect(path).toBe('/graphql');
    expect(body).toEqual({
      query: print(ListNotes),
      variables: { limit: 20, offset: 40 },
      operationName: 'ListNotes',
    });
    expect(result.current.data).toEqual({ items: [note], total: 1 });
  });

  it('useCreateNote sends CreateNote, notifies and invalidates ["notes"] like the REST hook', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { createNote: note } });
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useCreateNote(), { wrapper: Wrapper });
    result.current.mutate({ title: 'T', body: 'B' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [path, body] = sent();
    expect(path).toBe('/graphql');
    expect(body).toEqual({
      query: print(CreateNote),
      variables: { input: { title: 'T', body: 'B' } },
      operationName: 'CreateNote',
    });
    expect(result.current.data).toEqual(note);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] });
    expect(notify.success).toHaveBeenCalledWith('notes.saved');
  });

  it('useCreateNote does not invalidate when the GraphQL response carries errors', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: null, errors: [{ message: 'Forbidden' }] });
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useCreateNote(), { wrapper: Wrapper });
    result.current.mutate({ title: 'T', body: 'B' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('useUpdateNote sends UpdateNote with {id, input: patch}, notifies and invalidates ["notes"]', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { updateNote: { ...note, title: 'X' } } });
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useUpdateNote(), { wrapper: Wrapper });
    result.current.mutate({ id: 'n1', patch: { title: 'X' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, body] = sent();
    expect(body).toEqual({
      query: print(UpdateNote),
      variables: { id: 'n1', input: { title: 'X' } },
      operationName: 'UpdateNote',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] });
    expect(notify.success).toHaveBeenCalledWith('notes.saved');
  });

  it('useDeleteNote sends DeleteNote with {id}, notifies and invalidates ["notes"]', async () => {
    vi.mocked(api).mockResolvedValueOnce({ data: { deleteNote: true } });
    const { Wrapper, invalidate } = wrapper();
    const { result } = renderHook(() => useDeleteNote(), { wrapper: Wrapper });
    result.current.mutate('n1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, body] = sent();
    expect(body).toEqual({
      query: print(DeleteNote),
      variables: { id: 'n1' },
      operationName: 'DeleteNote',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notes'] });
    expect(notify.success).toHaveBeenCalledWith('notes.deleted');
  });
});
