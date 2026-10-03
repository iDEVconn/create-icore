import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/create-api';
import { RESET_ERROR_KEYS, resolveResetError } from '../reset-error';

describe('resolveResetError', () => {
  it('400 invalid_reset_token → invalidToken', () => {
    const err = new ApiError(400, { message: 'invalid_reset_token' }, 'invalid_reset_token');
    expect(resolveResetError(err)).toBe('invalidToken');
  });

  it('400 weak_password → weakPassword', () => {
    const err = new ApiError(400, { message: 'weak_password' }, 'weak_password');
    expect(resolveResetError(err)).toBe('weakPassword');
  });

  it('400 password_too_short → weakPassword', () => {
    const err = new ApiError(400, { message: 'password_too_short' }, 'password_too_short');
    expect(resolveResetError(err)).toBe('weakPassword');
  });

  it.each([
    new ApiError(500, { message: 'Internal server error' }, 'Internal server error'),
    new Error('network down'),
    'boom',
  ])('anything else → other', (err) => {
    expect(resolveResetError(err)).toBe('other');
  });

  it('maps every kind to an i18n key', () => {
    expect(RESET_ERROR_KEYS).toEqual({
      invalidToken: 'auth.resetPasswordInvalidToken',
      weakPassword: 'auth.resetPasswordWeak',
      other: 'auth.resetPasswordRetryHint',
    });
  });
});
