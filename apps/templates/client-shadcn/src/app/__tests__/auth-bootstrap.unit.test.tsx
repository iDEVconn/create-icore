import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as silentRefresh from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@icore/template-shared', async () => {
  const actual =
    await vi.importActual<typeof import('@icore/template-shared')>('@icore/template-shared');
  return { ...actual, performSilentRefresh: vi.fn() };
});

function clearCsrfCookie() {
  document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
}

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    clearCsrfCookie();
    vi.mocked(silentRefresh.performSilentRefresh).mockReset();
  });

  afterEach(() => {
    clearCsrfCookie();
  });

  it('shows a loading state, then renders children once the refresh resolves', async () => {
    document.cookie = 'icore_csrf=csrf-abc';
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce({
      accessToken: 'at',
      user: { id: 'u1', email: 'u@x.com' },
    });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    expect(screen.queryByText('protected content')).toBeNull();
    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'u@x.com' });
    expect(silentRefresh.performSilentRefresh).toHaveBeenCalledTimes(1);
  });

  it('clears a stale persisted user when the refresh fails (unauthenticated state, not an error)', async () => {
    document.cookie = 'icore_csrf=csrf-abc';
    useAuthStore.setState({ user: { id: 'stale', email: 'stale@x.com' } });
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce(null);

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('skips the network call entirely when there is no CSRF cookie (anonymous page load)', async () => {
    clearCsrfCookie();
    useAuthStore.setState({ user: { id: 'stale', email: 'stale@x.com' } });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(silentRefresh.performSilentRefresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
