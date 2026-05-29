import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';
import { api } from '../main';

type Status = 'verifying' | 'done' | 'error';

function resolveToken(params: URLSearchParams): string | null {
  const direct = params.get('token') ?? params.get('token_hash');
  if (direct) return direct;
  const oobCode = params.get('oobCode');
  const email = params.get('email');
  if (oobCode && email) {
    const b64 =
      typeof window === 'undefined'
        ? Buffer.from(email, 'utf8').toString('base64')
        : window.btoa(email);
    return `${b64}:${oobCode}`;
  }
  return null;
}

function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = resolveToken(params);
    if (!token) {
      setStatus('error');
      notify.error(t('auth.callbackMissingToken'));
      return;
    }
    api<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string; role?: string };
    }>('/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((session) => {
        setAuth(session);
        setStatus('done');
        void navigate({ to: '/_dashboard/dashboard' });
      })
      .catch((err) => {
        setStatus('error');
        notify.error(err instanceof Error ? err.message : t('auth.callbackFailed'));
      });
  }, []);

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        {status === 'verifying' && (
          <>
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('auth.callbackVerifying')}</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-destructive text-sm">{t('auth.callbackFailed')}</p>
        )}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/callback')({ component: CallbackPage });
