import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main', () => ({ api: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const noop = () => undefined;

// window.matchMedia is polyfilled globally in src/test-setup.ts (antd's Space/Grid
// responsive hooks call it, which jsdom doesn't implement).
describe('LoginForm — provider capability gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // These tests each pay for a full vi.resetModules() + dynamic re-import of
  // LoginForm (re-evaluating React/antd/i18n from scratch) so the module
  // picks up the freshly-stubbed env vars. That's consistently ~2.5s locally
  // but can exceed Vitest's 5s default under a busy, concurrent CI runner --
  // give these headroom rather than let them flake.
  it('hides OAuth buttons and magic-link toggle when the provider supports neither (postgres/mongodb default)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.queryByText('auth.continueWithGithub')).toBeNull();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  }, 15000);

  it('shows OAuth buttons and magic-link toggle when the provider supports both (supabase/firebase)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.getByText('auth.continueWithGithub')).toBeDefined();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  }, 15000);

  it('OAuth-only: shows the buttons, hides the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.getByText('auth.continueWithGoogle')).toBeDefined();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  }, 15000);

  it('magic-link-only: hides the buttons, shows the magic-link toggle', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm onSwitchRegister={noop} onSwitchMagicLink={noop} />);

    expect(screen.queryByText('auth.continueWithGoogle')).toBeNull();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  }, 15000);
});
