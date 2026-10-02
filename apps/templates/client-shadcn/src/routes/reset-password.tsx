import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { resolveResetToken, useAuthStore, useNotify } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';
import { api } from '@/main';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const token = resolveResetToken(new URLSearchParams(window.location.search));

  return (
    <main className="flex min-h-screen bg-[--color-background]">
      <AuthBrandPanel />

      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {token ? (
            <ResetPasswordForm
              api={api}
              token={token}
              onError={(msg) => notify.error(msg)}
              onSuccess={(session) => {
                setUser(session.user);
                notify.success(t('auth.resetPasswordSubmit'));
                void navigate({ to: '/dashboard' });
              }}
            />
          ) : (
            <p className="text-sm text-[--color-muted-foreground]">
              {t('auth.resetPasswordInvalidToken')}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/reset-password')({
  beforeLoad: () => {
    if (!AUTH_HAS_PASSWORD_RESET) throw redirect({ to: '/login' });
  },
  component: ResetPasswordPage,
});
