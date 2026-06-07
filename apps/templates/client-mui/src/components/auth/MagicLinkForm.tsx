import { useState } from 'react';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '@icore/template-shared';
import { api } from '@/main';

interface Props {
  onSwitchLogin: () => void;
}

export function MagicLinkForm({ onSwitchLogin }: Props) {
  const { t } = useTranslation();
  const notify = useNotify();

  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSentEmail(email);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentEmail) {
    return (
      <Stack spacing={3} alignItems="center" textAlign="center">
        <MailOutlineIcon sx={{ fontSize: 56, color: 'primary.main' }} />
        <Stack spacing={1}>
          <Typography variant="h5" fontWeight={600}>
            {t('auth.magicLinkSent')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth.magicLinkSentDescription', { email: sentEmail })}
          </Typography>
        </Stack>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => {
            setEmail('');
            setSentEmail('');
          }}
        >
          {t('auth.magicLinkUseDifferentEmail')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h5" fontWeight={600}>
          {t('auth.withMagicLink')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.loginSubtitle')}
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
        <Button type="submit" variant="contained" fullWidth disabled={submitting} sx={{ mt: 2 }}>
          {t('auth.sendMagicLink')}
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" textAlign="center">
        <Box
          component="span"
          onClick={onSwitchLogin}
          sx={{
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {t('auth.backToLogin')}
        </Box>
      </Typography>
    </Stack>
  );
}
