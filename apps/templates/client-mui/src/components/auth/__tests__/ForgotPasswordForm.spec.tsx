import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/main';
import { ForgotPasswordForm } from '../ForgotPasswordForm';

vi.mock('@/main', () => ({ api: vi.fn() }));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
  });

  it('posts the email to /auth/password/forgot and shows the sent state', async () => {
    vi.mocked(api).mockResolvedValue({ ok: true } as never);
    render(<ForgotPasswordForm onSwitchLogin={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/auth\.email/), { target: { value: 'a@x.com' } });
    fireEvent.submit(screen.getByLabelText(/auth\.email/).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText('auth.forgotPasswordSent')).toBeDefined());
    expect(api).toHaveBeenCalledWith(
      '/auth/password/forgot',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
