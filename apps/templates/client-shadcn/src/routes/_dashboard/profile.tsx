import { createFileRoute } from '@tanstack/react-router';
import { SyntheticEvent, useEffect, useState } from 'react';
import { useDraft, useAuthStore } from '@icore/template-shared';
import { PageLayout } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
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
