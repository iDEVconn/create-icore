import { describe, expect, it } from 'vitest';
import { isConfirmationRequired, type RegisterResponse } from '../register-response';

describe('isConfirmationRequired', () => {
  it('is true for the 202 confirmation payload', () => {
    const res: RegisterResponse = { status: 'confirmation_required', email: 'a@x.com' };
    expect(isConfirmationRequired(res)).toBe(true);
  });

  it('is false for a started session ({ user })', () => {
    const res: RegisterResponse = { user: { id: 'u1', email: 'a@x.com' } };
    expect(isConfirmationRequired(res)).toBe(false);
  });
});
