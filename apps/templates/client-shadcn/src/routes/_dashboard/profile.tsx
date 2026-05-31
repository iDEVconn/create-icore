import { SyntheticEvent, createFileRoute } from '@tanstack/react-router';
import { SyntheticEvent, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SyntheticEvent, useEffect, useState } from 'react';
import { SyntheticEvent, useDraft, useNotify, useAuthStore } from '@icore/template-shared';
import { SyntheticEvent, PageLayout } from '../../components/PageLayout';
import { SyntheticEvent, Button } from '../../components/ui/button';
import { SyntheticEvent, Input } from '../../components/ui/input';
import { SyntheticEvent, Label } from '../../components/ui/label';
import { SyntheticEvent, api } from '../../main';

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

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
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
      <form onSubmit={handleSubmit} className="max-w-md space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={authUser?.email ?? ''} readOnly disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <Button type="submit" disabled={!dirty || save.isPending || isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/profile')({
  component: ProfilePage,
});
