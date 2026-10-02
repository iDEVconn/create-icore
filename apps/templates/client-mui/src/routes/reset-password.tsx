import { createFileRoute, redirect } from '@tanstack/react-router';
import { Box, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { resolveResetToken } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isLg = useMediaQuery(theme.breakpoints.up('lg'));
  const token = resolveResetToken(new URLSearchParams(window.location.search));

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
