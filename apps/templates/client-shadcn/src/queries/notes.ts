import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@icore/template-shared';
import { useTranslation } from 'react-i18next';
import { api } from '../main';

export interface Note {
  id: string;
  ownerId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

const KEY = ['notes'] as const;

export function useNotesList(limit: number, offset: number) {
  return useQuery({
    queryKey: [...KEY, { limit, offset }],
    queryFn: () => api<{ items: Note[]; total: number }>(`/notes?limit=${limit}&offset=${offset}`),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      api<Note>('/notes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      notify.success(t('notes.saved'));
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { title?: string; body?: string } }) =>
      api<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      notify.success(t('notes.saved'));
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: string) => api(`/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      notify.success(t('notes.deleted'));
    },
  });
}
