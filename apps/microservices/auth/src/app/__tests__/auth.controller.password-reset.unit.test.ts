import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthStrategy, createMockSupabaseClient } from '@icore/auth-supabase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController — password reset', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    return { mock, strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('forgot forwards email + callbackUrl to the strategy and answers {ok:true}', async () => {
    const { mock, controller } = fixture();
    await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    await expect(
      controller.requestPasswordReset({
        email: 'a@x.com',
        callbackUrl: 'https://my.app/reset-password',
      }),
    ).resolves.toEqual({ ok: true });
    expect(mock.getLastResetRedirect()).toBe('https://my.app/reset-password');
  });

  it('reset returns a session for the new password carrying the role', async () => {
    const { mock, strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    await controller.requestPasswordReset({ email: 'boss@x.com', callbackUrl: 'https://my.app/r' });

    const session = await controller.confirmPasswordReset({
      token: mock.getPasswordResetToken('boss@x.com'),
      password: 'newpw123!',
    });

    expect(session.user.email).toBe('boss@x.com');
    expect(await strategy.getRole(session.user.id)).toBe('admin');
    await expect(strategy.signIn('boss@x.com', 'newpw123!')).resolves.toBeTruthy();
  });

  it('reset with a bogus token rejects', async () => {
    const { controller } = fixture();
    await expect(
      controller.confirmPasswordReset({ token: 'nope', password: 'newpw123!' }),
    ).rejects.toBeTruthy();
  });
});
