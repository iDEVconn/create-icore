import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Box, CircularProgress, Container, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';

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
    void navigate({ to: '/_dashboard/dashboard' });
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
        {status === 'restoring' && (
          <>
            <CircularProgress />
            <Typography color="text.secondary">{t('auth.callbackVerifying')}</Typography>
          </>
        )}
        {status === 'error' && <Typography color="error">{t('auth.oauthFailed')}</Typography>}
      </Box>
    </Container>
  );
}

export const Route = createFileRoute('/auth/oauth/callback')({ component: OAuthCallbackPage });
