import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/auth/RegisterForm';
import { MagicLinkForm } from '../components/auth/MagicLinkForm';
import { CheckEmailScreen } from '../components/auth/CheckEmailScreen';
import { api } from '@/main';

type Mode = 'login' | 'register' | 'magicLink' | 'checkEmail';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('login');
  const [confirmedEmail, setConfirmedEmail] = useState('');

  function handleLoginSuccess(session: {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role?: string };
  }) {
    setAuth(session);
    notify.success(t('auth.login'));
    void navigate({ to: '/dashboard' });
  }

  function handleRegisterSuccess(email: string) {
    setConfirmedEmail(email);
    setMode('checkEmail');
  }

  function handleError(msg: string) {
    notify.error(msg);
  }

  return (
    <main className="flex min-h-screen bg-[--color-background]">
      <AuthBrandPanel />

      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {mode === 'login' && (
            <LoginForm
              api={api}
              onSuccess={handleLoginSuccess}
              onError={handleError}
              onSwitchToRegister={() => setMode('register')}
              onSwitchToMagicLink={() => setMode('magicLink')}
            />
          )}
          {mode === 'register' && (
            <RegisterForm
              api={api}
              onSuccess={handleRegisterSuccess}
              onError={handleError}
              onSwitchToLogin={() => setMode('login')}
            />
          )}
          {mode === 'magicLink' && (
            <MagicLinkForm
              api={api}
              onError={handleError}
              onSwitchToLogin={() => setMode('login')}
            />
          )}
          {mode === 'checkEmail' && (
            <CheckEmailScreen email={confirmedEmail} onBack={() => setMode('login')} />
          )}
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
