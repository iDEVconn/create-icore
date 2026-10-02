import { useEffect, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { resolveEmailAction, useAuthStore, useNotify } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';
import { api } from '@/main';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const [action] = useState(() => resolveEmailAction(new URLSearchParams(window.location.search)));

  useEffect(() => {
    if (action.kind === 'signIn') {
      // Firebase's action URL is project-wide: a magic-link email lands here too.
      window.location.replace(`/auth/callback?${action.search}`);
    } else if (action.kind === 'ignore') {
      void navigate({ to: '/login' });
    } else if (action.kind === 'reset') {
      // The reset token is a live credential: don't leave it in the URL / history.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [action, navigate]);

  if (action.kind === 'signIn' || action.kind === 'ignore') return null;
  const token = action.kind === 'reset' ? action.token : null;

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
                notify.success(t('auth.resetPasswordSuccess'));
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
