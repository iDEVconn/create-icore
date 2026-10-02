import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthStrategy, createMockSupabaseClient } from '@icore/auth-supabase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController.signup × email confirmation required', () => {
  const fixture = (
    env: Record<string, string | undefined> = {},
    requireEmailConfirmation = true,
  ) => {
    const mock = createMockSupabaseClient({ requireEmailConfirmation });
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

  it('duplicate signup of a registered email answers confirmation_required too and never touches roles', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    const setRole = vi.spyOn(strategy, 'setRole');
    const getRole = vi.spyOn(strategy, 'getRole');

    const again = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });

    expect(again).toMatchObject({ status: 'confirmation_required' });
    // the obfuscated user's random id is not a real account — no admin API calls for it
    expect(getRole).not.toHaveBeenCalled();
    expect(setRole).not.toHaveBeenCalled();
  });

  it('propagates real errors (user exists with confirmation OFF) unchanged', async () => {
    const { controller } = fixture({}, false);
    await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    await expect(controller.signup({ email: 'a@x.com', password: 'pw12345!' })).rejects.toThrow(
      'user exists',
    );
  });
});
