import { SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

interface MagicLinkFormProps {
  onError: (msg: string) => void;
  onSwitchToLogin: () => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export function MagicLinkForm({ onError, onSwitchToLogin, api }: MagicLinkFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      onError(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[--color-primary]/15">
          <MailCheck size={24} className="text-[--color-primary]" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{t('auth.magicLinkSent')}</h3>
          <p className="text-sm text-[--color-muted-foreground] max-w-xs">
            {t('auth.magicLinkSentDescription', { email })}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full cursor-pointer"
          onClick={() => {
            setEmail('');
            setSent(false);
          }}
        >
          {t('auth.magicLinkUseDifferentEmail')}
        </Button>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-sm text-[--color-muted-foreground] hover:underline cursor-pointer"
        >
          {t('auth.backToLogin')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('auth.withMagicLink')}</h1>
        <p className="text-sm text-[--color-muted-foreground]">
          {t('auth.magicLinkSentDescription', { email: 'your email' }).replace(
            'your email',
            t('auth.email').toLowerCase(),
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ml-email">{t('auth.email')}</Label>
          <Input
            id="ml-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" className="w-full cursor-pointer" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : t('auth.sendMagicLink')}
        </Button>
      </form>

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="block w-full text-center text-sm text-[--color-muted-foreground] hover:underline cursor-pointer"
      >
        {t('auth.backToLogin')}
      </button>
    </div>
  );
}
