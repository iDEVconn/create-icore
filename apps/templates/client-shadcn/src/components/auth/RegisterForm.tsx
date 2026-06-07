import { SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface RegisterFormProps {
  onSuccess: (email: string) => void;
  onError: (msg: string) => void;
  onSwitchToLogin: () => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function RegisterForm({ onSuccess, onError, onSwitchToLogin, api }: RegisterFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setValidationError('');
    if (password !== confirm) {
      setValidationError(t('auth.passwordMismatch'));
      return;
    }
    setSubmitting(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      onSuccess(email);
    } catch (err) {
      onError(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('auth.registerTitle')}</h1>
        <p className="text-sm text-[--color-muted-foreground]">{t('auth.registerSubtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reg-email">{t('auth.email')}</Label>
          <Input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reg-password">{t('auth.password')}</Label>
          <Input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reg-confirm">{t('auth.confirmPassword')}</Label>
          <Input
            id="reg-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
          />
          {validationError && (
            <p className="text-xs text-[--color-destructive]">{validationError}</p>
          )}
        </div>
        <Button type="submit" className="w-full cursor-pointer" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : t('auth.register')}
        </Button>
      </form>

      <p className="text-center text-sm text-[--color-muted-foreground]">
        {t('auth.switchToLogin')}{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-[--color-primary] font-medium hover:underline cursor-pointer"
        >
          {t('auth.switchToLoginLink')}
        </button>
      </p>
    </div>
  );
}
