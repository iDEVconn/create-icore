import { Button, Result } from 'antd';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export function AccessDeniedPage() {
  const { t } = useTranslation();
  return (
    <Result
      status="403"
      title={t('error.accessDenied')}
      subTitle={t('error.unknown')}
      extra={
        <Link to="/_dashboard/dashboard">
          <Button type="primary">Dashboard</Button>
        </Link>
      }
    />
  );
}
