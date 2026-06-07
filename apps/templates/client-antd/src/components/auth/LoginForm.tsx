import { Button, Divider, Form, Input, Space, Typography } from 'antd';
import { GithubOutlined, GoogleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface FormValues {
  email: string;
  password: string;
}

interface Props {
  onSwitchRegister: () => void;
  onSwitchMagicLink: () => void;
}

export function LoginForm({ onSwitchRegister, onSwitchMagicLink }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form] = Form.useForm<FormValues>();

  async function handleFinish(values: FormValues) {
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
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.loginTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.loginSubtitle')}</Typography.Text>
      </Space>

      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Button
          block
          icon={<GoogleOutlined />}
          onClick={() => window.location.assign('/api/auth/oauth/google')}
        >
          {t('auth.continueWithGoogle')}
        </Button>
        <Button
          block
          icon={<GithubOutlined />}
          onClick={() => window.location.assign('/api/auth/oauth/github')}
        >
          {t('auth.continueWithGithub')}
        </Button>
      </Space>

      <Divider plain>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('auth.orContinueWith')}
        </Typography.Text>
      </Divider>

      <Form form={form} layout="vertical" onFinish={handleFinish} autoComplete="on">
        <Form.Item
          name="email"
          label={t('auth.email')}
          rules={[
            { required: true, message: `${t('auth.email')} is required` },
            { type: 'email', message: 'Please enter a valid email' },
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

        <Form.Item style={{ marginBottom: 8 }}>
          <Button type="primary" htmlType="submit" block size="large">
            {t('auth.login')}
          </Button>
        </Form.Item>
      </Form>

      <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('auth.switchToRegister')}{' '}
          <Typography.Link onClick={onSwitchRegister}>
            {t('auth.switchToRegisterLink')}
          </Typography.Link>
        </Typography.Text>
        <Typography.Link onClick={onSwitchMagicLink} style={{ fontSize: 13 }}>
          {t('auth.withMagicLink')}
        </Typography.Link>
      </Space>
    </Space>
  );
}
