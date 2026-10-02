import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '../ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  it('posts the email to /auth/password/forgot and shows the sent state', async () => {
    const api = vi.fn(async () => ({ ok: true }));
    render(<ForgotPasswordForm api={api as never} onError={vi.fn()} onSwitchToLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'a@x.com' } });
    fireEvent.submit(screen.getByLabelText('auth.email').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('auth.forgotPasswordSent')).toBeDefined());
    expect(api).toHaveBeenCalledWith(
      '/auth/password/forgot',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
