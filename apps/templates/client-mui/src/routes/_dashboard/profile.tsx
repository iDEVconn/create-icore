import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { useDraft, useAuthStore } from '@icore/template-shared';
import { PageLayout } from '@/components/PageLayout';
import { useProfile, useUpdateProfile } from '@/queries/profile';

function ProfilePage() {
  const authUser = useAuthStore((s) => s.user);

  const { data, isPending } = useProfile();

  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  useDraft(dirty);

  useEffect(() => {
    if (data?.email) setName(data.email);
  }, [data?.email]);

  const save = useUpdateProfile();

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    save.mutate(name, { onSuccess: () => setDirty(false) });
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
          slotProps={{ htmlInput: { readOnly: true } }}
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
