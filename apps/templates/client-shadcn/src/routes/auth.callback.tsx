import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setAccessToken, useAuthStore, useNotify } from '@icore/template-shared';
import { Loader2 } from 'lucide-react';
import { api } from '@/main';

type Status = 'verifying' | 'done' | 'error';

interface HashSession {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

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

// Supabase's hosted /auth/v1/verify endpoint (the default emailRedirectTo
// target) can also be configured to use the implicit flow, verifying the
// OTP server-side and redirecting here with the session already issued as
// URL-fragment params -- a different shape than the query-param token this
// route's other path expects to exchange itself.
export function resolveHashSession(hash: string): HashSession | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  try {
    const payloadSegment = accessToken.split('.')[1];
    if (!payloadSegment) return null;
    const json =
      typeof window === 'undefined'
        ? Buffer.from(payloadSegment, 'base64').toString('utf8')
        : window.atob(payloadSegment);
    const payload = JSON.parse(json) as { sub?: string; email?: string };
    if (!payload.sub || !payload.email) return null;
    return { accessToken, refreshToken, user: { id: payload.sub, email: payload.email } };
  } catch {
    return null;
  }
}

function CallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    const hashSession = resolveHashSession(window.location.hash);
    if (hashSession) {
      void (async () => {
        // hashSession's raw refresh token transited the URL hash (Supabase's
        // implicit-flow redirect target is the SPA itself, not the gateway) --
        // adopt it server-side so the gateway can re-host it as an httpOnly
        // cookie and this session survives a reload, same as every other
        // sign-in method.
        let accessToken = hashSession.accessToken;
        let user: { id: string; email: string; role?: string } = hashSession.user;
        try {
          const session = await api<{
            accessToken: string;
            user: { id: string; email: string; role?: string };
          }>('/auth/session/adopt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: hashSession.accessToken,
              refreshToken: hashSession.refreshToken,
            }),
          });
          accessToken = session.accessToken;
          user = session.user;
        } catch {
          // Cookie adoption failed -- fall back to the unverified client-side
          // session rather than stranding the user; the access token really
          // is valid Supabase-issued, but the reload-persistence property is
          // lost on this path (degraded, not insecure).
        }
        setAccessToken(accessToken);
        setUser(user);
        setStatus('done');
        void navigate({ to: '/dashboard' });
      })();
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = resolveToken(params);
    if (!token) {
      setStatus('error');
      notify.error(t('auth.callbackMissingToken'));
      return;
    }
    api<{
      accessToken: string;
      user: { id: string; email: string; role?: string };
    }>('/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((session) => {
        setAccessToken(session.accessToken);
        setUser(session.user);
        setStatus('done');
        void navigate({ to: '/dashboard' });
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
