import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthStrategy, createMockSupabaseClient } from '@icore/auth-supabase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController.signup × email confirmation required', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation: true });
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    return { mock, strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('returns { status: "confirmation_required", user } instead of throwing', async () => {
    const { controller } = fixture();
    const result = await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    expect(result).toMatchObject({
      status: 'confirmation_required',
      user: { email: 'a@x.com' },
    });
  });

  it('still assigns the initial role (user) even though no session exists yet', async () => {
    const { strategy, controller } = fixture();
    const result = await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    if (!('status' in result)) throw new Error('expected confirmation_required');
    expect(await strategy.getRole(result.user.id)).toBe('user');
  });

  it('assigns admin to an ADMINS_LIST email', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const result = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    if (!('status' in result)) throw new Error('expected confirmation_required');
    expect(await strategy.getRole(result.user.id)).toBe('admin');
  });

  it('forwards callbackUrl to the strategy as the email redirect', async () => {
    const { mock, controller } = fixture();
    await controller.signup({
      email: 'a@x.com',
      password: 'pw12345!',
      callbackUrl: 'https://my.app/auth/callback',
    });
    expect(mock.getLastSignUpOptions()).toEqual({
      emailRedirectTo: 'https://my.app/auth/callback',
    });
  });

  it('propagates real errors (e.g. user exists) unchanged', async () => {
    const { controller } = fixture();
    await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    await expect(controller.signup({ email: 'a@x.com', password: 'pw12345!' })).rejects.toThrow(
      'user exists',
    );
  });
});
