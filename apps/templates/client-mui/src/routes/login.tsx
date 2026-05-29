import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Box, Button, Container, Paper, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '../main';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const session = await api<{
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      setAuth({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        user: session.user,
      });
      notify.success(t('auth.login'));
      await navigate({ to: '/_dashboard/dashboard' });
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
        <Typography variant="body2" color="text.secondary" mb={3}>
          {t('auth.email')} &amp; {t('auth.password')}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} autoComplete="on" noValidate={false}>
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
      </Paper>
    </Container>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
