import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
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
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {status === 'verifying' && (
          <>
            <CircularProgress />
            <Typography color="text.secondary">{t('auth.callbackVerifying')}</Typography>
          </>
        )}
        {status === 'error' && <Typography color="error">{t('auth.callbackFailed')}</Typography>}
      </Box>
    </Container>
  );
}

export const Route = createFileRoute('/auth/callback')({ component: CallbackPage });
