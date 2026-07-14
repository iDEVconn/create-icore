import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const noop = () => undefined;
const baseProps = {
  api: async () => ({}) as never,
  onSuccess: noop,
  onError: noop,
  onSwitchToRegister: noop,
  onSwitchToMagicLink: noop,
};

describe('LoginForm — provider capability gating', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('hides the OAuth buttons and magic-link toggle when the provider supports neither (postgres/mongodb default)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'false');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'false');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm {...baseProps} />);

    expect(screen.queryByText('Google')).toBeNull();
    expect(screen.queryByText('GitHub')).toBeNull();
    expect(screen.queryByText('auth.withMagicLink')).toBeNull();
  });

  it('shows the OAuth buttons and magic-link toggle when the provider supports both (supabase/firebase)', async () => {
    vi.stubEnv('VITE_AUTH_HAS_OAUTH', 'true');
    vi.stubEnv('VITE_AUTH_HAS_MAGIC_LINK', 'true');
    vi.resetModules();
    const { LoginForm } = await import('../LoginForm');

    render(<LoginForm {...baseProps} />);

    expect(screen.getByText('Google')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
    expect(screen.getByText('auth.withMagicLink')).toBeDefined();
  });
});
