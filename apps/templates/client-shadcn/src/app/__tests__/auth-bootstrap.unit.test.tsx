import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as silentRefresh from '@icore/template-shared';
import { useAuthStore } from '@icore/template-shared';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@icore/template-shared', async () => {
  const actual =
    await vi.importActual<typeof import('@icore/template-shared')>('@icore/template-shared');
  return { ...actual, performSilentRefresh: vi.fn() };
});

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('shows a loading state, then renders children once the refresh resolves', async () => {
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
  });

  it('renders children even when the refresh fails (unauthenticated state, not an error)', async () => {
    vi.mocked(silentRefresh.performSilentRefresh).mockResolvedValueOnce(null);

    render(
      <AuthBootstrap>
        <div>protected content</div>
      </AuthBootstrap>,
    );

    await waitFor(() => expect(screen.getByText('protected content')).toBeTruthy());
    expect(useAuthStore.getState().user).toBeNull();
  });
});
