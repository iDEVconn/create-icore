import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { ApiError, useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface Props {
  token: string;
}

export function ResetPasswordForm({ token }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tooShort, setTooShort] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const short = password.length < 8;
    const differs = password !== confirmPassword;
    setTooShort(short);
    setMismatch(!short && differs);
    if (short || differs) return;
    setSubmitting(true);
    try {
      const session = await api<{ user: { id: string; email: string; role?: string } }>(
        '/auth/password/reset',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        },
      );
      setUser(session.user);
      notify.success(t('auth.resetPasswordSubmit'));
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(
        err instanceof ApiError && err.status === 400
          ? t('auth.resetPasswordInvalidToken')
          : err instanceof Error
            ? err.message
            : t('error.unknown'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={600}>
          {t('auth.resetPasswordTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.resetPasswordSubtitle')}
        </Typography>
      </Stack>

      <Box component="form" onSubmit={handleSubmit} autoComplete="on">
        <TextField
          label={t('auth.newPassword')}
          type="password"
          autoComplete="new-password"
          required
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setTooShort(false);
          }}
          error={tooShort}
          helperText={tooShort ? t('auth.passwordTooShort') : undefined}
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
          {t('auth.resetPasswordSubmit')}
        </Button>
      </Box>
    </Stack>
  );
}
