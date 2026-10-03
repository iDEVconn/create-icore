import { Button, Form, Input, Result, Space, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface FormValues {
  email: string;
}

interface Props {
  onSwitchLogin: () => void;
}

export function ForgotPasswordForm({ onSwitchLogin }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  async function handleFinish(values: FormValues) {
    setSubmitting(true);
    try {
      await api('/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      setSentEmail(values.email);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentEmail) {
    return (
      <Space orientation="vertical" size={0} style={{ width: '100%', textAlign: 'center' }}>
        <Result
          icon={<MailOutlined style={{ fontSize: 48, color: '#22c55e' }} />}
          title={t('auth.forgotPasswordSent')}
          subTitle={
            <Typography.Text type="secondary">
              {t('auth.forgotPasswordSentDescription', { email: sentEmail })}
            </Typography.Text>
          }
        />
        <Button
          block
          onClick={() => {
            setSentEmail('');
            form.resetFields();
          }}
        >
          {t('auth.magicLinkUseDifferentEmail')}
        </Button>
        <div style={{ marginTop: 12 }}>
          <Typography.Link onClick={onSwitchLogin} style={{ fontSize: 13 }}>
            {t('auth.backToLogin')}
          </Typography.Link>
        </div>
      </Space>
    );
  }

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space orientation="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.forgotPasswordTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.forgotPasswordSubtitle')}</Typography.Text>
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

        <Form.Item style={{ marginBottom: 8 }}>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting}>
            {t('auth.sendResetLink')}
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: 'center' }}>
        <Typography.Link onClick={onSwitchLogin} style={{ fontSize: 13 }}>
          {t('auth.backToLogin')}
        </Typography.Link>
      </div>
    </Space>
  );
}
