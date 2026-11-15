import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Form, Input } from 'antd';
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
    if (data) setName(data.name ?? '');
  }, [data]);

  const save = useUpdateProfile();

  function handleFinish() {
    save.mutate(name, { onSuccess: () => setDirty(false) });
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
