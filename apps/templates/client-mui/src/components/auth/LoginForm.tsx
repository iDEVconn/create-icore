import { useState } from 'react';
import { Box, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface Props {
  onSwitchRegister: () => void;
  onSwitchMagicLink: () => void;
}

export function LoginForm({ onSwitchRegister, onSwitchMagicLink }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setAuth(session);
      notify.success(t('auth.login'));
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={600}>
          {t('auth.loginTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.loginSubtitle')}
        </Typography>
      </Stack>

      <Stack spacing={1}>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<GoogleIcon />}
          onClick={() => window.location.assign('/api/auth/oauth/google')}
        >
          {t('auth.continueWithGoogle')}
        </Button>
        <Button
          variant="outlined"
          fullWidth
          startIcon={<GitHubIcon />}
          onClick={() => window.location.assign('/api/auth/oauth/github')}
        >
          {t('auth.continueWithGithub')}
        </Button>
      </Stack>

      <Divider>
        <Typography variant="caption" color="text.secondary">
          {t('auth.orContinueWith')}
        </Typography>
      </Divider>

      <Box component="form" onSubmit={handleSubmit} autoComplete="on">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          required
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 2 }}>
          {t('auth.login')}
        </Button>
      </Box>

      <Stack spacing={0.5} alignItems="center">
        <Typography variant="body2" color="text.secondary">
          {t('auth.switchToRegister')}{' '}
          <Box
            component="span"
            onClick={onSwitchRegister}
            sx={{
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {t('auth.switchToRegisterLink')}
          </Box>
        </Typography>
        <Box
          component="span"
          onClick={onSwitchMagicLink}
          sx={{
            fontSize: 13,
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {t('auth.withMagicLink')}
        </Box>
      </Stack>
    </Stack>
  );
}
