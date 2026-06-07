import { Button, Result, Space, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface Props {
  email: string;
  onBack: () => void;
}

export function CheckEmailScreen({ email, onBack }: Props) {
  const { t } = useTranslation();
  return (
    <Space direction="vertical" size={0} style={{ width: '100%', textAlign: 'center' }}>
      <Result
        icon={<MailOutlined style={{ fontSize: 48, color: '#22c55e' }} />}
        title={t('auth.checkEmail')}
        subTitle={
          <Typography.Text type="secondary">
            {t('auth.checkEmailDescription', { email })}
          </Typography.Text>
        }
      />
      <Button block onClick={onBack}>
        {t('auth.backToLogin')}
      </Button>
    </Space>
  );
}
