### Task 7: client-shadcn — forgot/reset forms, route, link

**Invoke `ui-ux-pro-max` first** (auth form pattern: reuse the existing `MagicLinkForm`/`RegisterForm` layout, spacing and the `MailCheck` sent-state; no new visual language).

**Files:**

- Create: `apps/templates/client-shadcn/src/components/auth/ForgotPasswordForm.tsx`, `.../ResetPasswordForm.tsx`
- Create: `apps/templates/client-shadcn/src/routes/reset-password.tsx`
- Modify: `.../components/auth/LoginForm.tsx` (flag + `onSwitchToForgot` link), `.../routes/login.tsx` (mode `forgot`)
- Regenerate + commit: `apps/templates/client-shadcn/src/routeTree.gen.ts`
- Tests: `.../components/auth/__tests__/ForgotPasswordForm.spec.tsx`, `ResetPasswordForm.spec.tsx`, extend `LoginForm.spec.tsx`

**Interfaces:**

- Consumes: i18n keys, `resolveResetToken`, `ApiError`, `useAuthStore`, `useNotify` (`@icore/template-shared`); gateway `POST /auth/password/forgot|reset`.
- Produces: `ForgotPasswordForm({ api, onError, onSwitchToLogin })`; `ResetPasswordForm({ api, token, onSuccess(session), onError })`; `LoginForm` gains required prop `onSwitchToForgot: () => void`.

- [ ] **Step 1: Write the failing tests.**

`ForgotPasswordForm.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '../ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  it('posts the email to /auth/password/forgot and shows the sent state', async () => {
    const api = vi.fn(async () => ({ ok: true }));
    render(<ForgotPasswordForm api={api as never} onError={vi.fn()} onSwitchToLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'a@x.com' } });
    fireEvent.submit(screen.getByLabelText('auth.email').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('auth.forgotPasswordSent')).toBeDefined());
    expect(api).toHaveBeenCalledWith(
      '/auth/password/forgot',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

`ResetPasswordForm.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from '../ResetPasswordForm';

function setup(
  apiImpl: () => Promise<unknown>,
  passwords: [string, string] = ['newpw123!', 'newpw123!'],
) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ResetPasswordForm
      api={apiImpl as never}
      token="tok"
      onSuccess={onSuccess}
      onError={onError}
    />,
  );
  fireEvent.change(screen.getByLabelText('auth.newPassword'), { target: { value: passwords[0] } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
    target: { value: passwords[1] },
  });
  fireEvent.submit(screen.getByLabelText('auth.newPassword').closest('form') as HTMLFormElement);
  return { onSuccess, onError };
}

describe('ResetPasswordForm', () => {
  it('posts token + password and signs in with the returned session', async () => {
    const session = { user: { id: 'u1', email: 'a@x.com', role: 'user' } };
    const { onSuccess } = setup(async () => session);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
  });

  it('rejects a short password client-side without calling the API', async () => {
    const api = vi.fn(async () => ({}));
    const { onSuccess, onError } = setup(api, ['short', 'short']);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.passwordTooShort'));
    expect(api).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const api = vi.fn(async () => ({}));
    const { onError } = setup(api, ['newpw123!', 'different1!']);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.passwordMismatch'));
    expect(api).not.toHaveBeenCalled();
  });
});
```

Extend `LoginForm.spec.tsx`: add `onSwitchToForgot: noop` to `baseProps`, and two cases (same `vi.stubEnv` + `vi.resetModules` + dynamic import pattern as the existing ones): flag `true` → `screen.getByText('auth.forgotPassword')` present; flag `false` → `queryByText` is null.

- [ ] **Step 2: Run to verify it fails** — `yarn nx test client-shadcn -- ForgotPasswordForm ResetPasswordForm`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.** `ForgotPasswordForm.tsx` — copy `MagicLinkForm.tsx`'s structure (email field, `MailCheck` sent view with "use a different email"/"back to login") with: endpoint `/auth/password/forgot`, ids `fp-email`, keys `auth.forgotPasswordTitle` / `auth.forgotPasswordSubtitle` / `auth.sendResetLink` / `auth.forgotPasswordSent` / `auth.forgotPasswordSentDescription` (with `{ email }`) / `auth.backToLogin`; the sent view uses `t('auth.magicLinkUseDifferentEmail')` for the secondary button. `ResetPasswordForm.tsx`:

```tsx
import { SyntheticEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@icore/template-shared';
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
      onError(
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
```

`routes/reset-password.tsx` (write the whole file in ONE pass — never leave a route file empty):

```tsx
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { resolveResetToken, useAuthStore, useNotify } from '@icore/template-shared';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';
import { ResetPasswordForm } from '../components/auth/ResetPasswordForm';
import { api } from '@/main';

const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setUser = useAuthStore((s) => s.setUser);
  const token = resolveResetToken(new URLSearchParams(window.location.search));

  return (
    <main className="flex min-h-screen bg-[--color-background]">
      <AuthBrandPanel />
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          {token ? (
            <ResetPasswordForm
              api={api}
              token={token}
              onError={(msg) => notify.error(msg)}
              onSuccess={(session) => {
                setUser(session.user);
                notify.success(t('auth.resetPasswordSubmit'));
                void navigate({ to: '/dashboard' });
              }}
            />
          ) : (
            <p className="text-sm text-[--color-muted-foreground]">
              {t('auth.resetPasswordInvalidToken')}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/reset-password')({
  beforeLoad: () => {
    if (!AUTH_HAS_PASSWORD_RESET) throw redirect({ to: '/login' });
  },
  component: ResetPasswordPage,
});
```

`LoginForm.tsx`: add `const AUTH_HAS_PASSWORD_RESET = (import.meta.env.VITE_AUTH_HAS_PASSWORD_RESET as string) === 'true';`, add `onSwitchToForgot: () => void;` to props and destructuring, and render directly under the password `Input` block (inside the form):

```tsx
{
  AUTH_HAS_PASSWORD_RESET && (
    <button
      type="button"
      onClick={onSwitchToForgot}
      className="text-sm text-[--color-muted-foreground] hover:underline cursor-pointer"
    >
      {t('auth.forgotPassword')}
    </button>
  );
}
```

`login.tsx`: add `'forgot'` to `Mode`, import `ForgotPasswordForm`, pass `onSwitchToForgot={() => setMode('forgot')}` to `<LoginForm>`, and add `{mode === 'forgot' && (<ForgotPasswordForm api={api} onError={handleError} onSwitchToLogin={() => setMode('login')} />)}`.

- [ ] **Step 4: Regenerate the route tree.** Run `yarn nx run client-shadcn:vite:build` (the TanStack plugin rewrites `src/routeTree.gen.ts`); confirm `git diff apps/templates/client-shadcn/src/routeTree.gen.ts` contains `/reset-password`, then `node tools/create-icore/scripts/check-route-integrity.mjs` → OK.

- [ ] **Step 5: Verify** — `yarn nx test client-shadcn` PASS; `yarn nx lint client-shadcn`; build green.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/templates/client-shadcn/src
git add apps/templates/client-shadcn
git commit -m "feat(client-shadcn): forgot-password link, forgot + reset forms, /reset-password route"
```

---
