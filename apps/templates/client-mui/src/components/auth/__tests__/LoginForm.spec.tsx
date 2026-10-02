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

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.queryByText('auth.continueWithGithub')).toBeNull();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  }, 15000);

  it('shows OAuth buttons and magic-link toggle when the provider supports both (supabase/firebase)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.getByText('auth.continueWithGithub')).toBeDefined();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  }, 15000);

  it('OAuth-only: shows the buttons, hides the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  });

  it('magic-link-only: hides the buttons, shows the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  });

  it('shows the forgot-password link when the provider supports password reset', async () => {
    vi.stubEnv('VITE_AUTH_HAS_PASSWORD_RESET', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.getByText('auth.forgotPassword')).toBeDefined();
  }, 15000);

  it('hides the forgot-password link when the provider does not support it', async () => {
    vi.stubEnv('VITE_AUTH_HAS_PASSWORD_RESET', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} onSwitchForgot={noop} />);

    expect(screen.queryByText('auth.forgotPassword')).toBeNull();
  }, 15000);
});
