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

export function MagicLinkForm({ onSwitchLogin }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const [form] = Form.useForm<FormValues>();
  const [sentEmail, setSentEmail] = useState('');

  async function handleFinish(values: FormValues) {
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email }),
      });
      setSentEmail(values.email);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  if (sentEmail) {
    return (
      <Space direction="vertical" size={0} style={{ width: '100%', textAlign: 'center' }}>
        <Result
          icon={<MailOutlined style={{ fontSize: 48, color: '#22c55e' }} />}
          title={t('auth.magicLinkSent')}
          subTitle={
            <Typography.Text type="secondary">
              {t('auth.magicLinkSentDescription', { email: sentEmail })}
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
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.withMagicLink')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.loginSubtitle')}</Typography.Text>
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
          <Button type="primary" htmlType="submit" block size="large">
            {t('auth.sendMagicLink')}
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
