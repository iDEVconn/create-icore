import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setAccessToken, useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';
import { api } from '@/main';

type Status = 'restoring' | 'done' | 'error';

function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64 = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function OAuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const [status, setStatus] = useState<Status>('restoring');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);

    // Supabase implicit flow: access_token (snake_case) -- session was issued
    // directly to the SPA via URL fragment, never adopted as an httpOnly
    // cookie yet.
    // Gateway server redirect: accessToken (camelCase) -- Task 7's oauthCallback
    // route already called setAuthCookies before this redirect, so no adoption
    // call is needed (or safe to skip for clarity; calling it again would be
    // harmless but redundant).
    const snakeCaseToken = params.get('access_token');
    const camelCaseToken = params.get('accessToken');
    const accessTokenFromUrl = snakeCaseToken ?? camelCaseToken;
    const refreshTokenFromUrl = params.get('refresh_token');

    if (!accessTokenFromUrl) {
      setStatus('error');
      notify.error(t('auth.oauthCallbackMissingTokens'));
      void navigate({ to: '/login' });
      return;
    }

    const userId =
      params.get('userId') ?? (parseJwtPayload(accessTokenFromUrl)['sub'] as string) ?? '';
    const email =
      params.get('email') ?? (parseJwtPayload(accessTokenFromUrl)['email'] as string) ?? '';

    void (async () => {
      let accessToken = accessTokenFromUrl;
      let user: { id: string; email: string; role?: string } = { id: userId, email };

      // Only the snake_case (Supabase implicit-flow) branch needs cookie
      // adoption -- its raw refresh token transited the URL hash and no
      // httpOnly cookie has been set for it yet.
      if (snakeCaseToken && refreshTokenFromUrl) {
        try {
          const session = await api<{
            accessToken: string;
            user: { id: string; email: string; role?: string };
          }>('/auth/session/adopt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: accessTokenFromUrl,
              refreshToken: refreshTokenFromUrl,
            }),
          });
          accessToken = session.accessToken;
          user = session.user;
        } catch {
          // Cookie adoption failed -- fall back to the unverified client-side
          // session rather than stranding the user; degraded (no
          // reload-persistence), not insecure.
        }
      }

      setAccessToken(accessToken);
      setUser(user);
      setStatus('done');
      void navigate({ to: '/dashboard' });
    })();
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
