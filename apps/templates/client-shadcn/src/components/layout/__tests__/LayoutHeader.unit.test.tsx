import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@icore/template-shared';
import * as apiModule from '../../../main';
import { LayoutHeader } from '../LayoutHeader';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  })),
}));

vi.mock('../../../main', () => ({
  api: vi.fn(),
}));

describe('LayoutHeader', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    useAuthStore.setState({ user: { id: '1', email: 'test@example.com' } });
  });

  it('calls POST /auth/logout, clears user, then navigates to login on logout click', async () => {
    const mockApi = vi.mocked(apiModule.api);
    mockApi.mockResolvedValueOnce({});

    render(<LayoutHeader />);

    // Find and click the logout button (desktop version)
    const logoutButton = screen.getByRole('button', { name: 'common.logout' });
    fireEvent.click(logoutButton);

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    });

    // Verify the state was cleared
    expect(useAuthStore.getState().user).toBeNull();

    // Verify navigation happened
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
  });

  it('clears local state and navigates to login even if logout API call fails', async () => {
    const mockApi = vi.mocked(apiModule.api);
    mockApi.mockRejectedValueOnce(new Error('Network error'));

    render(<LayoutHeader />);

    const logoutButton = screen.getByRole('button', { name: 'common.logout' });
    fireEvent.click(logoutButton);

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    });

    // Verify the state was cleared despite the error
    expect(useAuthStore.getState().user).toBeNull();

    // Verify navigation happened despite the error
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
  });
});
