import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Typography } from 'antd';
import { resolveResetToken } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const token = resolveResetToken(new URLSearchParams(window.location.search));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#020617' }}>
      <div style={{ flex: 1, display: 'none' }} className="auth-brand-lg">
        <AuthBrandPanel />
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
        }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <Typography.Text type="secondary">
              {t('auth.resetPasswordInvalidToken')}
            </Typography.Text>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/reset-password')({
  beforeLoad: () => {
    if (!AUTH_HAS_PASSWORD_RESET) throw redirect({ to: '/login' });
  },
  component: ResetPasswordPage,
});
