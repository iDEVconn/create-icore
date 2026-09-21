import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@icore/template-shared';
import * as apiModule from '@/main';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@/main', () => ({
  api: vi.fn(),
}));

// AuthBootstrap only calls GET /auth/session when the (non-httpOnly) CSRF
// cookie is present — see the short-circuit in the component.
function giveBrowserACsrfCookie() {
  document.cookie = 'icore_csrf=tok';
}

function clearCookies() {
  document.cookie = 'icore_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    vi.mocked(apiModule.api).mockReset();
    clearCookies();
  });

  afterEach(() => {
    clearCookies();
  });

  it('shows a loading state, then renders children once GET /auth/session resolves', async () => {
    giveBrowserACsrfCookie();
    vi.mocked(apiModule.api).mockResolvedValueOnce({
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
    expect(apiModule.api).toHaveBeenCalledWith('/auth/session');
  });

  it('clears a stale persisted user when GET /auth/session fails (401 unauthenticated, or a 503 -- either way logged out for this render)', async () => {
    giveBrowserACsrfCookie();
    useAuthStore.setState({ user: { id: 'stale', email: 'stale@x.com' } });
    vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('unauthorized'));

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(useAuthStore.getState().user).toBeNull();
  });

  // An anonymous visitor has no CSRF cookie, so the request could only ever
  // 401 -- skipping it keeps the first paint synchronous and leaves the
  // shared auth-burst throttle (10 req/60s, also covering login/register)
  // for requests that can actually succeed.
  it('skips the network call entirely when there is no CSRF cookie (anonymous visitor)', async () => {
    useAuthStore.setState({ user: { id: 'stale', email: 'stale@x.com' } });

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(apiModule.api).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
