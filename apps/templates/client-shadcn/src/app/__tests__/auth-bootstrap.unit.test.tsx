import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@icore/template-shared';
import * as apiModule from '@/main';
import { AuthBootstrap } from '../auth-bootstrap';

vi.mock('@/main', () => ({
  api: vi.fn(),
}));

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null });
    vi.mocked(apiModule.api).mockReset();
  });

  it('shows a loading state, then renders children once GET /auth/session resolves', async () => {
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
});
