import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '../main';

type Mode = 'password' | 'magicLinkRequest' | 'magicLinkSent';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
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
      await navigate({ to: '/_dashboard/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLinkSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSentEmail(email);
      setMode('magicLinkSent');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper elevation={3} sx={{ width: '100%', p: 4 }}>
        <Typography variant="h5" component="h1" fontWeight={600} mb={0.5}>
          {t('auth.login')}
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          {t('auth.email')} &amp; {t('auth.password')}
        </Typography>

        {mode !== 'magicLinkSent' && (
          <>
            <Tabs
              value={mode}
              onChange={(_, v: Mode) => setMode(v)}
              variant="fullWidth"
              sx={{ mb: 2 }}
            >
              <Tab label={t('auth.withPassword')} value="password" />
              <Tab label={t('auth.withMagicLink')} value="magicLinkRequest" />
            </Tabs>
            <Stack spacing={1} sx={{ mb: 2 }}>
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
            <Divider sx={{ mb: 2 }} />
          </>
        )}

        {mode === 'password' && (
          <Box component="form" onSubmit={handlePasswordSubmit} autoComplete="on">
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
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ mt: 2 }}
            >
              {t('auth.login')}
            </Button>
          </Box>
        )}

        {mode === 'magicLinkRequest' && (
          <Box component="form" onSubmit={handleMagicLinkSubmit} autoComplete="on">
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
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ mt: 2 }}
            >
              {t('auth.sendMagicLink')}
            </Button>
          </Box>
        )}

        {mode === 'magicLinkSent' && (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Typography variant="h6">{t('auth.magicLinkSent')}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t('auth.magicLinkSentDescription', { email: sentEmail })}
            </Typography>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setEmail('');
                setSentEmail('');
                setMode('magicLinkRequest');
              }}
            >
              {t('auth.magicLinkUseDifferentEmail')}
            </Button>
          </Stack>
        )}
      </Paper>
    </Container>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
