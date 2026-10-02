import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@icore/template-shared';
import { ResetPasswordForm } from '../ResetPasswordForm';

function setup(
  apiImpl: () => Promise<unknown>,
  passwords: [string, string] = ['newpw123!', 'newpw123!'],
) {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ResetPasswordForm
      api={apiImpl as never}
      token="tok"
      onSuccess={onSuccess}
      onError={onError}
    />,
  );
  fireEvent.change(screen.getByLabelText('auth.newPassword'), { target: { value: passwords[0] } });
  fireEvent.change(screen.getByLabelText('auth.confirmPassword'), {
    target: { value: passwords[1] },
  });
  fireEvent.submit(screen.getByLabelText('auth.newPassword').closest('form') as HTMLFormElement);
  return { onSuccess, onError };
}

describe('ResetPasswordForm', () => {
  it('posts token + password and signs in with the returned session', async () => {
    const session = { user: { id: 'u1', email: 'a@x.com', role: 'user' } };
    const { onSuccess } = setup(async () => session);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(session));
  });

  it('rejects a short password client-side without calling the API', async () => {
    const api = vi.fn(async () => ({}));
    const { onSuccess, onError } = setup(api, ['short', 'short']);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.passwordTooShort'));
    expect(api).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', async () => {
    const api = vi.fn(async () => ({}));
    const { onError } = setup(api, ['newpw123!', 'different1!']);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.passwordMismatch'));
    expect(api).not.toHaveBeenCalled();
  });

  it('shows the weak-password copy (not "link invalid") when the server answers 400 weak_password', async () => {
    const { onError } = setup(async () => {
      throw new ApiError(400, { message: 'weak_password' }, 'weak_password');
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.resetPasswordWeak'));
  });

  it('shows the retry hint for a non-400 failure', async () => {
    const { onError } = setup(async () => {
      throw new ApiError(500, { message: 'Internal server error' }, 'Internal server error');
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith('auth.resetPasswordRetryHint'));
  });
});
