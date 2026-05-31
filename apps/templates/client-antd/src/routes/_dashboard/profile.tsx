import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Form, Input } from 'antd';
import { useDraft, useNotify, useAuthStore } from '@icore/template-shared';
import { PageLayout } from '@/components/PageLayout';
import { api } from '@/main';

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

  function handleFinish() {
    save.mutate(name);
  }

  return (
    <PageLayout
      title="Profile"
      description="Edit your account details."
      action="read"
      subject="Profile"
    >
      <Form layout="vertical" onFinish={handleFinish} style={{ maxWidth: 480 }}>
        <Form.Item label="Email">
          <Input value={authUser?.email ?? ''} readOnly disabled />
        </Form.Item>

        <Form.Item label="Display name">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            disabled={!dirty || save.isPending || isPending}
            loading={save.isPending}
          >
            Save
          </Button>
        </Form.Item>
      </Form>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_dashboard/profile')({
  component: ProfilePage,
});
