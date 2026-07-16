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

