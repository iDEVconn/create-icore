import { describe, expect, it } from 'vitest';
import { AuthController } from '../auth.controller';

// Lives next to the auth feature on purpose: auth=none projects delete apps/api/src/app/auth.
describe('AuthController rate limits', () => {
  it('keeps login and password reset inside the auth-burst limiter', () => {
    // If these decorators disappeared, skipUnlessDeclared would stop limiting them by auth-burst.
    expect(Reflect.getMetadata('THROTTLER:LIMITauth-burst', AuthController)).toBe(10);
    expect(
      Reflect.getMetadata('THROTTLER:LIMITauth-burst', AuthController.prototype.forgotPassword),
    ).toBe(5);
  });
});
