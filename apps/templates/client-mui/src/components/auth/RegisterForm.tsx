import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  isConfirmationRequired,
  useAuthStore,
  useNotify,
  type RegisterResponse,
} from '@icore/template-shared';
import { api } from '@/main';

interface Props {
  onSuccess: (email: string) => void;
  onSwitchLogin: () => void;
}

export function RegisterForm({ onSuccess, onSwitchLogin }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setSubmitting(true);
    try {
      const res = await api<RegisterResponse>('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (isConfirmationRequired(res)) {
        onSuccess(res.email);
      } else {
        setUser(res.user);
        notify.success(t('auth.login'));
        await navigate({ to: '/dashboard' });
      }
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
          {t('auth.registerTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.registerSubtitle')}
        </Typography>
      </Stack>

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
          autoComplete="new-password"
          required
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label={t('auth.confirmPassword')}
          type="password"
          autoComplete="new-password"
          required
          fullWidth
          margin="normal"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setMismatch(false);
          }}
          error={mismatch}
          helperText={mismatch ? t('auth.passwordMismatch') : undefined}
        />
        <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 2 }}>
          {t('auth.register')}
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" textAlign="center">
        {t('auth.switchToLogin')}{' '}
        <Box
          component="span"
          onClick={onSwitchLogin}
          sx={{
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {t('auth.switchToLoginLink')}
        </Box>
      </Typography>
    </Stack>
  );
}
