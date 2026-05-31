import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';

type Status = 'restoring' | 'done' | 'error';

function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [status, setStatus] = useState<Status>('restoring');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userId = params.get('userId');
    const email = params.get('email');
    if (!accessToken || !refreshToken || !userId || !email) {
      setStatus('error');
      notify.error(t('auth.oauthCallbackMissingTokens'));
      void navigate({ to: '/login' });
      return;
    }
    setAuth({
      accessToken,
      refreshToken,
      user: { id: userId, email },
    });
    setStatus('done');
    void navigate({ to: '/dashboard' });
  }, []);

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        {status === 'restoring' && (
          <>
            <Loader2 className="text-muted-foreground size-8 animate-spin" />
            <p className="text-muted-foreground text-sm">{t('auth.callbackVerifying')}</p>
          </>
        )}
        {status === 'error' && <p className="text-destructive text-sm">{t('auth.oauthFailed')}</p>}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/oauth/callback')({ component: OAuthCallbackPage });
