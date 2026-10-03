import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '../RegisterForm';

function setup(apiResult: unknown) {
  const onSuccess = vi.fn();
  const onSignedIn = vi.fn();
  render(
    <RegisterForm
      api={(async () => apiResult) as never}
      onSuccess={onSuccess}
      onSignedIn={onSignedIn}
      onError={vi.fn()}
      onSwitchToLogin={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('auth.email'), { target: { value: 'a@x.com' } });
  fireEvent.change(screen.getByLabelText('auth.password'), { target: { value: 'pw12345!' } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
    target: { value: 'pw12345!' },
  });
  fireEvent.submit(screen.getByLabelText('auth.email').closest('form') as HTMLFormElement);
  return { onSuccess, onSignedIn };
}

describe('RegisterForm — register response handling', () => {
  it('shows the check-email flow on 202 confirmation_required', async () => {
    const { onSuccess, onSignedIn } = setup({ status: 'confirmation_required', email: 'a@x.com' });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('a@x.com'));
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('signs the user in when a session was started', async () => {
    const session = { user: { id: 'u1', email: 'a@x.com', role: 'user' } };
    const { onSuccess, onSignedIn } = setup(session);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(session));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
