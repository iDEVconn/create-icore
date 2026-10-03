import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/main';
import { ResetPasswordForm } from '../ResetPasswordForm';

vi.mock('@/main', () => ({ api: vi.fn() }));
const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

function fillAndSubmit(password: string, confirm: string) {
  render(<ResetPasswordForm token="tok" />);
  fireEvent.change(screen.getByLabelText('auth.newPassword'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: /auth\.resetPasswordSubmit/ }));
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    navigate.mockReset();
  });

  it('posts token + password, then navigates to the dashboard', async () => {
    vi.mocked(api).mockResolvedValue({ user: { id: 'u1', email: 'a@x.com' } } as never);
    fillAndSubmit('newpw123!', 'newpw123!');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }));
    const [path, init] = vi.mocked(api).mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/auth/password/reset');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'tok', password: 'newpw123!' });
  });

  it('does not call the API for a short password', async () => {
    fillAndSubmit('short', 'short');
    await waitFor(() => expect(screen.getByText('auth.passwordTooShort')).toBeDefined());
    expect(api).not.toHaveBeenCalled();
  });

  it('does not call the API when the passwords differ', async () => {
    fillAndSubmit('newpw123!', 'different1!');
    await waitFor(() => expect(screen.getByText('auth.passwordMismatch')).toBeDefined());
    expect(api).not.toHaveBeenCalled();
  });
});
