import { Button, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  RESET_ERROR_KEYS,
  resolveResetError,
  useAuthStore,
  useNotify,
} from '@icore/template-shared';
import { api } from '@/main';

interface FormValues {
  password: string;
  confirmPassword: string;
}

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  async function handleFinish(values: FormValues) {
    setSubmitting(true);
    try {
      const session = await api<{ user: { id: string; email: string; role?: string } }>(
        '/auth/password/reset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password: values.password }),
        },
      );
      setUser(session.user);
      notify.success(t('auth.resetPasswordSuccess'));
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(t(RESET_ERROR_KEYS[resolveResetError(err)]));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space orientation="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.resetPasswordTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.resetPasswordSubtitle')}</Typography.Text>
      </Space>

      <Form form={form} layout="vertical" onFinish={handleFinish} autoComplete="on">
        <Form.Item
          name="password"
          label={t('auth.newPassword')}
          rules={[
            { required: true, message: `${t('auth.newPassword')} is required` },
            { min: 8, message: t('auth.passwordTooShort') },
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={t('auth.confirmPassword')}
          dependencies={['password']}
          rules={[
            { required: true, message: `${t('auth.confirmPassword')} is required` },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(t('auth.passwordMismatch')));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" size="large" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            {t('auth.resetPasswordSubmit')}
          </Button>
        </Form.Item>
      </Form>
    </Space>
  );
}
