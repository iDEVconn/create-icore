import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ProfileResolver } from '../profile.resolver';

describe('ProfileResolver', () => {
  it('me returns the session user', () => {
    const user = { uid: 'u1', email: 'u1@x.com', role: 'user' };
    expect(new ProfileResolver().me(user)).toBe(user);
  });

  it('me answers 401 instead of a null-field error when no user is attached', () => {
    expect(() => new ProfileResolver().me(undefined)).toThrow(UnauthorizedException);
  });
});
