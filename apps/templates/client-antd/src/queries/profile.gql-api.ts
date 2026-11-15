// GraphQL twin of ./profile.ts: same exports, signatures, query key and
// notifications. create-icore renames it over profile.ts for `--api=graphql`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotify } from '@icore/template-shared';
import { request } from '../api/graphql';
import { GetMe, UpdateProfile } from '../graphql/profile.queries';

export interface Profile {
  uid: string;
  email: string;
  role?: string | null;
  /** Display name; null until one is set. */
  name?: string | null;
}

const KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Profile> => (await request(GetMe)).me,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const notify = useNotify();
  return useMutation({
    mutationFn: async (name: string) => (await request(UpdateProfile, { name })).updateProfile,
    onSuccess: () => {
      notify.success('Saved');
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'save_failed'),
  });
}
