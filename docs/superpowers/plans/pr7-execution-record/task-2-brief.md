### Task 2: Gate `client-mui`'s `LoginForm`

**Files:**
- Modify: `apps/templates/client-mui/src/components/auth/LoginForm.tsx`
- Create: `apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx`

**Root cause:** `LoginForm.tsx:60-77` renders the Google/GitHub `Button`s unconditionally; `LoginForm.tsx:126-137` renders the magic-link `Box` unconditionally. Same underlying issue as PR4 — `postgres`/`mongodb` don't implement `startOAuth`/`sendMagicLink`.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main', () => ({ api: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const noop = () => undefined;

describe('LoginForm — provider capability gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('hides OAuth buttons and magic-link toggle when the provider supports neither (postgres/mongodb default)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.queryByText('auth.continueWithGithub')).toBeNull();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  });

  it('shows OAuth buttons and magic-link toggle when the provider supports both (supabase/firebase)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.getByText('auth.continueWithGithub')).toBeDefined();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  });

  it('OAuth-only: shows the buttons, hides the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  });

  it('magic-link-only: hides the buttons, shows the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  });
});
```

(The 4-case matrix — including the two mixed-flag cases — is included from the start here, unlike PR4 where the mixed cases were added after task review found the gap. Same regression class, now designed in up front.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test client-mui -- LoginForm.spec.tsx`
Expected: FAIL — `LoginForm.tsx` doesn't read the env vars yet, all 4 cases see the OAuth buttons and magic-link toggle rendered unconditionally.

- [ ] **Step 3: Gate the JSX**

```tsx
// apps/templates/client-mui/src/components/auth/LoginForm.tsx
import { useState } from 'react';
import { Box, Button, Divider, Stack, TextField, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import GitHubIcon from '@mui/icons-material/GitHub';
import { SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '@/main';

const AUTH_HAS_OAUTH = (import.meta.env.VITE_AUTH_HAS_OAUTH as string) === 'true';
const AUTH_HAS_MAGIC_LINK = (import.meta.env.VITE_AUTH_HAS_MAGIC_LINK as string) === 'true';

interface Props {
  onSwitchRegister: () => void;
  onSwitchMagicLink: () => void;
}

export function LoginForm({ onSwitchRegister, onSwitchMagicLink }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
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
      await navigate({ to: '/dashboard' });
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
          {t('auth.loginTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('auth.loginSubtitle')}
        </Typography>
      </Stack>

      {AUTH_HAS_OAUTH && (
        <>
          <Stack spacing={1}>
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

          <Divider>
            <Typography variant="caption" color="text.secondary">
              {t('auth.orContinueWith')}
            </Typography>
          </Divider>
        </>
      )}

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

      <Stack spacing={0.5} alignItems="center">
        <Typography variant="body2" color="text.secondary">
          {t('auth.switchToRegister')}{' '}
          <Box
            component="span"
            onClick={onSwitchRegister}
            sx={{
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {t('auth.switchToRegisterLink')}
          </Box>
        </Typography>
        {AUTH_HAS_MAGIC_LINK && (
          <Box
            component="span"
            onClick={onSwitchMagicLink}
            sx={{
              fontSize: 13,
              color: 'primary.main',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {t('auth.withMagicLink')}
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
```

(Only the two constants and the two conditional wraps are additions — the email/password form, the register-switch link, and all component internals are otherwise unchanged from the current file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test client-mui -- LoginForm.spec.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full client-mui suite to confirm no regression**

Run: `npx nx test client-mui`
Expected: PASS — includes the pre-existing `app.spec.tsx`.

- [ ] **Step 6: Confirm the actual build target name, then build-verify**

Run: `npx nx show project client-mui --json` — find the real build target (PR4 found `client-shadcn`'s is `vite:build`, not `build`; don't assume `client-mui`'s matches without checking).
Run: `npx nx run client-mui:<real-build-target>`
Expected: green.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/templates/client-mui/src/components/auth/LoginForm.tsx apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
npx nx lint client-mui
git add apps/templates/client-mui/src/components/auth/LoginForm.tsx apps/templates/client-mui/src/components/auth/__tests__/LoginForm.spec.tsx
git commit -m "fix(client): gate mui LoginForm's OAuth buttons + magic-link toggle on provider capability"
```

---

