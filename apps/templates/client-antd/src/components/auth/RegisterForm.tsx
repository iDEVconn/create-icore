import { Button, Form, Input, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface FormValues {
  email: string;
  password: string;
  confirmPassword: string;
}

interface Props {
  onSuccess: (email: string) => void;
  onSwitchLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchLogin }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [form] = Form.useForm<FormValues>();

  async function handleFinish(values: FormValues) {
    try {
      await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      onSuccess(values.email);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.registerTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.registerSubtitle')}</Typography.Text>
      </Space>

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

        <Form.Item style={{ marginBottom: 8 }}>
          <Button type="primary" htmlType="submit" block size="large">
            {t('auth.register')}
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('auth.switchToLogin')}{' '}
          <Typography.Link onClick={onSwitchLogin}>{t('auth.switchToLoginLink')}</Typography.Link>
        </Typography.Text>
      </div>
    </Space>
  );
}
