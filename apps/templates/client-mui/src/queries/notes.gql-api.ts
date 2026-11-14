// GraphQL twin of ./notes.ts: same exports, signatures, query keys and
// notifications. create-icore renames it over notes.ts for `--api=graphql`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@icore/template-shared';
import { useTranslation } from 'react-i18next';
import { request } from '../api/graphql';
import { CreateNote, DeleteNote, ListNotes, UpdateNote } from '../graphql/notes.queries';

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
    queryFn: async (): Promise<{ items: Note[]; total: number }> =>
      (await request(ListNotes, { limit, offset })).notes,
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const notify = useNotify();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (input: { title: string; body: string }): Promise<Note> =>
      (await request(CreateNote, { input })).createNote,
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { title?: string; body?: string };
    }): Promise<Note> => (await request(UpdateNote, { id, input: patch })).updateNote,
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
    mutationFn: async (id: string): Promise<boolean> =>
      (await request(DeleteNote, { id })).deleteNote,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      notify.success(t('notes.deleted'));
    },
  });
}
