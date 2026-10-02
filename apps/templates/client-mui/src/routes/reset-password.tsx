import { useEffect, useState } from 'react';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { resolveEmailAction } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isLg = useMediaQuery(theme.breakpoints.up('lg'));
  const navigate = useNavigate();
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
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#020617' }}>
      {isLg && <AuthBrandPanel />}

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: '40px 24px',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t('auth.resetPasswordInvalidToken')}
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export const Route = createFileRoute('/reset-password')({
  beforeLoad: () => {
    if (!AUTH_HAS_PASSWORD_RESET) throw redirect({ to: '/login' });
  },
  component: ResetPasswordPage,
});
