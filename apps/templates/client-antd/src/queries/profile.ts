import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@icore/template-shared';
import { api } from '../main';

export interface Profile {
  uid: string;
  email: string;
  role?: string | null;
}

const KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<Profile>('/profile'),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: (name: string) =>
      api('/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      notify.success('Saved');
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'save_failed'),
  });
}
