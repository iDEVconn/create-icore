import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Form, Input } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '../main';

interface LoginFormValues {
  email: string;
  password: string;
}

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [form] = Form.useForm<LoginFormValues>();

  async function handleFinish(values: LoginFormValues) {
    try {
      const session = await api<{
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      setAuth({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      });
      notify.success(t('auth.login'));
      await navigate({ to: '/_dashboard/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{t('auth.login')}</h1>
        <p style={{ marginBottom: 24, color: 'rgba(0,0,0,0.45)' }}>
          {t('auth.email')} &amp; {t('auth.password')}
        </p>

        <Form form={form} layout="vertical" onFinish={handleFinish} autoComplete="on">
          <Form.Item
            name="email"
            label={t('auth.email')}
            rules={[
              { required: true, message: `${t('auth.email')} is required` },
              { type: 'email', message: 'Please enter a valid email address' },
            ]}
          >
            <Input autoComplete="email" size="large" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('auth.password')}
            rules={[{ required: true, message: `${t('auth.password')} is required` }]}
          >
            <Input.Password autoComplete="current-password" size="large" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block size="large">
              {t('auth.login')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </main>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
