// GraphQL twin of ./profile.ts: same exports, signatures, query key and
// notifications. create-icore renames it over profile.ts for `--api=graphql`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@icore/template-shared';
import { api } from '../main';
import { request } from '../api/graphql';
import { GetMe } from '../graphql/profile.queries';

export interface Profile {
  uid: string;
  email: string;
  role?: string | null;
}

const KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Profile> => (await request(GetMe)).me,
  });
}

// The GraphQL schema has no profile mutation (only `me`), so saving keeps the
// exact REST request of ./profile.ts until the gateway exposes one.
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
