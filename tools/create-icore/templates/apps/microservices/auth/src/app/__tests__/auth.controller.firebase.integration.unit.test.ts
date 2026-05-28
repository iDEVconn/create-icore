import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  FirebaseAuthStrategy,
  createMockIdentityToolkit,
  createMockAdminAuth,
} from '@icore/auth-firebase';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController × FirebaseAuthStrategy × ADMINS_LIST', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const toolkit = createMockIdentityToolkit();
    const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
    const strategy = new FirebaseAuthStrategy({ identityToolkit: toolkit.client, adminAuth });
    return { strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('signup auto-assigns admin role when email is in ADMINS_LIST', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com, owner@x.com' });
    const session = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    expect(await strategy.getRole(session.user.id)).toBe('admin');
  });

  it('signup auto-assigns user role for non-admin email', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'normal@x.com', password: 'pw12345!' });
    expect(await strategy.getRole(session.user.id)).toBe('user');
  });

  it('signup auto-assigns user role when ADMINS_LIST is unset', async () => {
    const { strategy, controller } = fixture({});
    const session = await controller.signup({ email: 'a@x.com', password: 'pw12345!' });
    expect(await strategy.getRole(session.user.id)).toBe('user');
  });

  it('does not overwrite an existing role on later setRole calls', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    expect(await strategy.getRole(session.user.id)).toBe('admin');
    await controller.setRole({ uid: session.user.id, role: 'user' });
    expect(await strategy.getRole(session.user.id)).toBe('user');
  });

  it('ADMINS_LIST is case-insensitive on email match', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'BOSS@x.COM' });
    const session = await controller.signup({ email: 'boss@X.com', password: 'pw12345!' });
    expect(await strategy.getRole(session.user.id)).toBe('admin');
  });
});
