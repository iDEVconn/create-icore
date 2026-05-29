import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '../main';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

type Mode = 'password' | 'magicLinkRequest' | 'magicLinkSent';

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
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

  async function handleMagicLinkSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setMode('magicLinkSent');
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('auth.login')}</CardTitle>
          <CardDescription>
            {t('auth.email')} &amp; {t('auth.password')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode !== 'magicLinkSent' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'password' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('password')}
              >
                {t('auth.withPassword')}
              </Button>
              <Button
                type="button"
                variant={mode === 'magicLinkRequest' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setMode('magicLinkRequest')}
              >
                {t('auth.withMagicLink')}
              </Button>
            </div>
          )}

          {mode === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('common.loading') : t('auth.login')}
              </Button>
            </form>
          )}

          {mode === 'magicLinkRequest' && (
            <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-ml">{t('auth.email')}</Label>
                <Input
                  id="email-ml"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('common.loading') : t('auth.sendMagicLink')}
              </Button>
            </form>
          )}

          {mode === 'magicLinkSent' && (
            <div className="space-y-3 text-center">
              <h3 className="text-lg font-semibold">{t('auth.magicLinkSent')}</h3>
              <p className="text-muted-foreground text-sm">
                {t('auth.magicLinkSentDescription', { email })}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setEmail('');
                  setMode('magicLinkRequest');
                }}
              >
                {t('auth.magicLinkUseDifferentEmail')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
});
