import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { useDraft, useNotify, useAuthStore } from '@icore/template-shared';
import { PageLayout } from '../../components/PageLayout';
import { api } from '../../main';

interface ProfilePayload {
  uid: string;
  email?: string;
  role?: string;
}

function ProfilePage() {
  const notify = useNotify();
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);

  const { data, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<ProfilePayload>('/profile'),
  });

  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  useDraft(dirty);

  useEffect(() => {
    if (data?.email) setName(data.email);
  }, [data?.email]);

  const save = useMutation({
    mutationFn: async (next: string) =>
      api('/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      }),
    onSuccess: () => {
      setDirty(false);
      notify.success('Saved');
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => notify.error(err instanceof Error ? err.message : 'save_failed'),
  });

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate(name);
  }

  return (
    <PageLayout
      title="Profile"
      description="Edit your account details."
      action="read"
      subject="Profile"
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        <TextField
          label="Email"
          value={authUser?.email ?? ''}
          inputProps={{ readOnly: true }}
          disabled
          fullWidth
        />

        <TextField
          label="Display name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          fullWidth
        />

        <Box>
          <Button
            type="submit"
            variant="contained"
            disabled={!dirty || save.isPending || isPending}
          >
            Save
          </Button>
        </Box>
      </Box>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/profile')({
  component: ProfilePage,
});
