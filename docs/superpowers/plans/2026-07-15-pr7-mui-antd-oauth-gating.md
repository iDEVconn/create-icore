# PR7: mui/antd OAuth/magic-link gating (mirrors PR4's shadcn fix)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `client-mui` and `client-antd` have the identical gap PR4 fixed for `client-shadcn`: `LoginForm` renders the Google/GitHub OAuth buttons and the magic-link toggle unconditionally, even though `postgres`/`mongodb` throw `not_implemented` for `startOAuth`/`sendMagicLink`. Gate both templates' `LoginForm` behind the same `VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK` flags PR4 introduced (the generator-side plumbing — `writeClientEnv` — already works for any `--ui=` choice, since it's keyed purely on `authProvider`).

**Found during planning (a real, separate bug, not part of PR4's original scope):** `apps/templates/client-mui/.env.example` and `apps/templates/client-antd/.env.example` have **no** `VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK` placeholder lines at all — only `client-shadcn/.env.example` has them (added in PR4). `writeClientEnv`'s `.replace(/^VITE_AUTH_HAS_OAUTH=.*$/m, ...)` is a no-op when the pattern doesn't match anything already present. So a `--ui=mui` or `--ui=antd` scaffold today would generate an `apps/client/.env` with **neither var written at all** — meaning the new gating code this PR adds would read `undefined`, evaluate to `false`, and hide the OAuth buttons/magic-link toggle unconditionally, even for `--auth=supabase`/`--auth=firebase` where they should show. Task 1 fixes this first, since Tasks 2–3 depend on it working correctly.

**Architecture:** Same as PR4: two module-level constants read `import.meta.env.VITE_AUTH_HAS_OAUTH`/`VITE_AUTH_HAS_MAGIC_LINK`, gate the relevant JSX blocks. No generator logic changes needed beyond the two `.env.example` files (already correct in `scaffold-env.ts` since PR5).

**Tech Stack:** Vite (`import.meta.env`), MUI v6 (`@mui/material`), Ant Design (`antd`), React 19, Vitest + `@testing-library/react` + `jsdom` (same root-hoisted harness PR4 confirmed works for `client-shadcn` — applies identically here, proven by each template's own pre-existing `app.spec.tsx`).

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`.
- TDD: failing test first, both for the `.env.example` content-invariant test and the two component tests.
- `npx prettier --write <touched files>` before every commit.
- `nx lint <project>` 0 errors, `nx build <project>` (or the project's actual build target — confirm via `npx nx show project <name> --json`, PR4 found `client-shadcn`'s is `vite:build` not `build`; check `client-mui`/`client-antd` the same way, don't assume) green before commit.
- Every PR needs a `.changeset/<slug>.md`, `patch` bump.
- Branch: `bug/mui-antd-oauth-gating` cut from `dev`. PR base `dev`.
- Touched projects: `create-icore` (generator — only the `.env.example` template files, no `.ts` logic changes), `client-mui`, `client-antd` (repo-root `apps/templates/client-mui`/`client-antd` — the source of truth; `tools/create-icore/templates/` is a gitignored build artifact, never edit it directly; discard any stray drift there with `git checkout -- tools/create-icore/templates/` before committing, per PR1/PR4/PR5's known noise).
- Archive `.superpowers/sdd/*.md` into `docs/superpowers/plans/pr7-execution-record/` and commit it BEFORE opening the PR.
- `LoginForm.tsx` in both templates imports `api` from `@/main` and calls `useNavigate()` from `@tanstack/react-router` at module/render scope — the real `main.tsx` executes `createRoot(document.getElementById('root')!).render(...)` and `createRouter(...)` as side effects of being imported, so both component tests MUST `vi.mock('@/main', ...)` and `vi.mock('@tanstack/react-router', ...)` — this is NOT optional the way it was for `client-shadcn` (whose `LoginForm` took `api`/callbacks as props and needed no mocking).

---

### Task 1: Fix the missing `VITE_AUTH_HAS_*` placeholders in mui/antd `.env.example`

**Files:**
- Modify: `apps/templates/client-mui/.env.example`
- Modify: `apps/templates/client-antd/.env.example`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts`

**Root cause:** confirmed by reading both files directly — neither has a `VITE_AUTH_HAS_OAUTH=`/`VITE_AUTH_HAS_MAGIC_LINK=` line, unlike `client-shadcn/.env.example` (which got them in PR4). `writeClientEnv`'s regex-replace silently no-ops against content that doesn't match.

- [ ] **Step 1: Write the failing test — proves the REAL template files are missing the placeholder**

```typescript
// tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
// Add near the top, alongside existing imports:
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Mirrors the exact pattern already used in scaffold.unit.test.ts:976 for reading
// real repo files from a test (not a synthetic fixture).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

// Add a new describe block:
describe('writeClientEnv — real template .env.example files have the VITE_AUTH_HAS_* placeholder', () => {
  it.each(['client-shadcn', 'client-mui', 'client-antd'])(
    '%s/.env.example has both placeholder lines writeClientEnv depends on',
    async (uiTemplate) => {
      const envExample = await readFile(
        join(repoRoot, `apps/templates/${uiTemplate}/.env.example`),
        'utf8',
      );
      expect(envExample).toMatch(/^VITE_AUTH_HAS_OAUTH=.*$/m);
      expect(envExample).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=.*$/m);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts -t "VITE_AUTH_HAS"`
Expected: FAIL for `client-mui` and `client-antd` (neither line present); PASS for `client-shadcn` (already fixed in PR4).

- [ ] **Step 3: Add the placeholder lines to both templates**

```bash
# apps/templates/client-mui/.env.example
# append:

# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the
# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.
VITE_AUTH_HAS_OAUTH=false
VITE_AUTH_HAS_MAGIC_LINK=false
```

```bash
# apps/templates/client-antd/.env.example
# append:

# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the
# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.
VITE_AUTH_HAS_OAUTH=false
VITE_AUTH_HAS_MAGIC_LINK=false
```

(Byte-for-byte identical block to what `client-shadcn/.env.example` already has — same comment, same default values.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- scaffold-env.unit.test.ts -t "VITE_AUTH_HAS"`
Expected: PASS (all 3 templates).

- [ ] **Step 5: Run the full create-icore suite to confirm no regression**

Run: `npx nx test create-icore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/templates/client-mui/.env.example apps/templates/client-antd/.env.example tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
npx nx lint create-icore
git add apps/templates/client-mui/.env.example apps/templates/client-antd/.env.example tools/create-icore/src/lib/__tests__/scaffold-env.unit.test.ts
git commit -m "fix(scaffold): add missing VITE_AUTH_HAS_OAUTH/MAGIC_LINK placeholder to mui/antd .env.example

writeClientEnv's regex-replace silently no-ops when the placeholder line
isn't already present in the template's .env.example — client-mui and
client-antd never had it (only client-shadcn got it in PR4), so a
--ui=mui/--ui=antd scaffold generated apps/client/.env with neither var
written at all. Blocks the OAuth-gating fix this PR is about to add to
both templates' LoginForm.tsx — without this, the gate would read
undefined/false unconditionally, hiding OAuth even for supabase/firebase."
```

---

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

### Task 3: Gate `client-antd`'s `LoginForm`

**Files:**
- Modify: `apps/templates/client-antd/src/components/auth/LoginForm.tsx`
- Create: `apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx`

**Root cause:** same as Task 2, for the antd template. `LoginForm.tsx:53-68` renders the OAuth `Button`s unconditionally; `LoginForm.tsx:110-112` renders the magic-link `Typography.Link` unconditionally.

- [ ] **Step 1: Write the failing component test**

```tsx
// apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test client-antd -- LoginForm.spec.tsx`
Expected: FAIL — same reasoning as Task 2.

- [ ] **Step 3: Gate the JSX**

```tsx
// apps/templates/client-antd/src/components/auth/LoginForm.tsx
import { Button, Divider, Form, Input, Space, Typography } from 'antd';
import { GithubOutlined, GoogleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore, useNotify } from '@icore/template-shared';
import { api } from '@/main';

const AUTH_HAS_OAUTH = (import.meta.env.VITE_AUTH_HAS_OAUTH as string) === 'true';
const AUTH_HAS_MAGIC_LINK = (import.meta.env.VITE_AUTH_HAS_MAGIC_LINK as string) === 'true';

interface FormValues {
  email: string;
  password: string;
}

interface Props {
  onSwitchRegister: () => void;
  onSwitchMagicLink: () => void;
}

export function LoginForm({ onSwitchRegister, onSwitchMagicLink }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form] = Form.useForm<FormValues>();

  async function handleFinish(values: FormValues) {
    try {
      const session = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; role?: string };
      }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      setAuth(session);
      notify.success(t('auth.login'));
      await navigate({ to: '/dashboard' });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('error.unknown'));
    }
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {t('auth.loginTitle')}
        </Typography.Title>
        <Typography.Text type="secondary">{t('auth.loginSubtitle')}</Typography.Text>
      </Space>

      {AUTH_HAS_OAUTH && (
        <>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Button
              block
              icon={<GoogleOutlined />}
              onClick={() => window.location.assign('/api/auth/oauth/google')}
            >
              {t('auth.continueWithGoogle')}
            </Button>
            <Button
              block
              icon={<GithubOutlined />}
              onClick={() => window.location.assign('/api/auth/oauth/github')}
            >
              {t('auth.continueWithGithub')}
            </Button>
          </Space>

          <Divider plain>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('auth.orContinueWith')}
            </Typography.Text>
          </Divider>
        </>
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish} autoComplete="on">
        <Form.Item
          name="email"
          label={t('auth.email')}
          rules={[
            { required: true, message: `${t('auth.email')} is required` },
            { type: 'email', message: 'Please enter a valid email' },
          ]}
        >
          <Input autoComplete="email" size="large" />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('auth.password')}
          rules={[{ required: true, message: `${t('auth.password')} is required` }]}
        >
          <Input.Password autoComplete="current-password" size="large" />
        </Form.Item>

        <Form.Item style={{ marginBottom: 8 }}>
          <Button type="primary" htmlType="submit" block size="large">
            {t('auth.login')}
          </Button>
        </Form.Item>
      </Form>

      <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('auth.switchToRegister')}{' '}
          <Typography.Link onClick={onSwitchRegister}>
            {t('auth.switchToRegisterLink')}
          </Typography.Link>
        </Typography.Text>
        {AUTH_HAS_MAGIC_LINK && (
          <Typography.Link onClick={onSwitchMagicLink} style={{ fontSize: 13 }}>
            {t('auth.withMagicLink')}
          </Typography.Link>
        )}
      </Space>
    </Space>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test client-antd -- LoginForm.spec.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Run the full client-antd suite to confirm no regression**

Run: `npx nx test client-antd`
Expected: PASS.

- [ ] **Step 6: Confirm the actual build target name, then build-verify**

Run: `npx nx show project client-antd --json` — confirm the real build target name.
Run: `npx nx run client-antd:<real-build-target>`
Expected: green.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/templates/client-antd/src/components/auth/LoginForm.tsx apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx
npx nx lint client-antd
git add apps/templates/client-antd/src/components/auth/LoginForm.tsx apps/templates/client-antd/src/components/auth/__tests__/LoginForm.spec.tsx
git commit -m "fix(client): gate antd LoginForm's OAuth buttons + magic-link toggle on provider capability"
```

---

### Task 4: Changeset + build gate

**Files:**
- Create: `.changeset/pr7-mui-antd-oauth-gating.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix the same OAuth/magic-link gating gap PR4 closed for client-shadcn, now for client-mui and client-antd: LoginForm was rendering the Google/GitHub buttons and magic-link toggle unconditionally even though postgres/mongodb don't implement either. Also fixes a related generator bug found during this work — client-mui's and client-antd's .env.example files were missing the VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK placeholder lines entirely (only client-shadcn had them), so writeClientEnv's regex-replace silently never wrote either var for --ui=mui/--ui=antd scaffolds.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore client-mui client-antd` (adjust `build` to whatever target name Tasks 2/3 confirmed if `run-many -t build` doesn't resolve it — `nx run-many` matches by target name across projects, so if the real target is `vite:build`, use `npx nx run-many -t lint test vite:build -p create-icore client-mui client-antd` instead, or run `build`/`vite:build` per-project as needed).
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr7-mui-antd-oauth-gating.md
git commit -m "chore: add changeset for PR7 mui/antd OAuth gating fixes"
```

## Self-Review

- **Spec coverage:** the documented follow-up ("client-mui/client-antd have the identical OAuth-gating bug PR4 fixed for client-shadcn") is closed for both templates.
- **Placeholder scan:** none — every step has complete, runnable code, including the newly-discovered `.env.example` fix.
- **Type consistency:** both `LoginForm` components keep their existing `Props` interface (`onSwitchRegister`/`onSwitchMagicLink`) unchanged — only the two new module-level constants and JSX conditionals are additions.
- **Scope note:** the mixed-flag test cases are included in Tasks 2/3 from the start (learned from PR4, where task review had to catch this gap after the fact) — no separate fix-and-re-review cycle needed here for that specific class of gap.
- **Real bug found during planning:** the missing `.env.example` placeholders (Task 1) is not in the original follow-up list the user approved — it's a necessary prerequisite discovered while designing Tasks 2–3, without which the gating fix would silently misbehave. Documented above in the plan's "Found during planning" section, not silently folded in without explanation.
