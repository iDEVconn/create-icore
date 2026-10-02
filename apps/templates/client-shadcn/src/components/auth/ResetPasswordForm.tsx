import { SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { RESET_ERROR_KEYS, resolveResetError } from '@icore/template-shared';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface ResetPasswordFormProps {
  token: string;
  onSuccess: (session: { user: { id: string; email: string; role?: string } }) => void;
  onError: (msg: string) => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function ResetPasswordForm({ token, onSuccess, onError, api }: ResetPasswordFormProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      onError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      onError(t('auth.passwordMismatch'));
      return;
    }
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
      onSuccess(session);
    } catch (err) {
      onError(t(RESET_ERROR_KEYS[resolveResetError(err)]));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('auth.resetPasswordTitle')}</h1>
        <p className="text-sm text-[--color-muted-foreground]">{t('auth.resetPasswordSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rp-password">{t('auth.newPassword')}</Label>
          <Input
            id="rp-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rp-confirm">{t('auth.confirmPassword')}</Label>
          <Input
            id="rp-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full cursor-pointer" disabled={submitting}>
          {submitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            t('auth.resetPasswordSubmit')
          )}
        </Button>
      </form>
    </div>
  );
}
