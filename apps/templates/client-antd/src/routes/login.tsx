import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Card, Form, Input, Result, Segmented } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '../main';

type Mode = 'password' | 'magicLinkRequest' | 'magicLinkSent';

interface PasswordFormValues {
  email: string;
  password: string;
}

interface MagicLinkFormValues {
  email: string;
}

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('password');
  const [sentEmail, setSentEmail] = useState('');
  const [passwordForm] = Form.useForm<PasswordFormValues>();
  const [magicLinkForm] = Form.useForm<MagicLinkFormValues>();

  async function handlePasswordFinish(values: PasswordFormValues) {
    try {
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      setAuth(session);
      notify.success(t('auth.login'));
      await navigate({ to: '/_dashboard/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  async function handleMagicLinkFinish(values: MagicLinkFormValues) {
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      setSentEmail(values.email);
      setMode('magicLinkSent');
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
        <p style={{ marginBottom: 16, color: 'rgba(0,0,0,0.45)' }}>
          {t('auth.email')} &amp; {t('auth.password')}
        </p>

        {mode !== 'magicLinkSent' && (
          <Segmented
            block
            value={mode}
            onChange={(v) => setMode(v as Mode)}
            options={[
              { label: t('auth.withPassword'), value: 'password' },
              { label: t('auth.withMagicLink'), value: 'magicLinkRequest' },
            ]}
            style={{ marginBottom: 16 }}
          />
        )}

        {mode === 'password' && (
          <Form
            form={passwordForm}
            layout="vertical"
            onFinish={handlePasswordFinish}
            autoComplete="on"
          >
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
        )}

        {mode === 'magicLinkRequest' && (
          <Form
            form={magicLinkForm}
            layout="vertical"
            onFinish={handleMagicLinkFinish}
            autoComplete="on"
          >
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

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block size="large">
                {t('auth.sendMagicLink')}
              </Button>
            </Form.Item>
          </Form>
        )}

        {mode === 'magicLinkSent' && (
          <Result
            status="success"
            title={t('auth.magicLinkSent')}
            subTitle={t('auth.magicLinkSentDescription', { email: sentEmail })}
            extra={
              <Button
                onClick={() => {
                  setSentEmail('');
                  magicLinkForm.resetFields();
                  setMode('magicLinkRequest');
                }}
              >
                {t('auth.magicLinkUseDifferentEmail')}
              </Button>
            }
          />
        )}
      </Card>
    </main>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
