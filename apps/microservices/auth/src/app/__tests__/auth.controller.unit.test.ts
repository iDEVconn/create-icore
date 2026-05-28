import { describe, expect, it } from 'vitest';
import { FakeAuthStrategy } from '@icore/shared';
import { AuthController } from '../auth.controller';

describe('AuthController', () => {
  const fixture = () => {
    const strategy = new FakeAuthStrategy();
    return { strategy, controller: new AuthController(strategy) };
  };

  it('signup → verify round-trip resolves the new uid', async () => {
    const { controller } = fixture();
    const session = await controller.signup({ email: 't@x.com', password: 'pw12345!' });
    expect(session.accessToken).toBeTruthy();
    const verified = await controller.verify({ token: session.accessToken });
    expect(verified.uid).toBe(session.user.id);
  });

  it('login after signup issues a new session for the same user', async () => {
    const { controller } = fixture();
    const signup = await controller.signup({ email: 'l@x.com', password: 'pw12345!' });
    const login = await controller.login({ email: 'l@x.com', password: 'pw12345!' });
    expect(login.user.id).toBe(signup.user.id);
  });

  it('refresh issues a new session and invalidates the used token', async () => {
    const { controller } = fixture();
    const first = await controller.signup({ email: 'r@x.com', password: 'pw12345!' });
    const next = await controller.refresh({ refreshToken: first.refreshToken });
    expect(next.user.id).toBe(first.user.id);
    await expect(controller.refresh({ refreshToken: first.refreshToken })).rejects.toThrow();
  });

  it('setRole writes a role visible on verify after re-login', async () => {
    const { controller } = fixture();
    const session = await controller.signup({ email: 's@x.com', password: 'pw12345!' });
    await controller.setRole({ uid: session.user.id, role: 'admin' });
    const re = await controller.login({ email: 's@x.com', password: 'pw12345!' });
    const verified = await controller.verify({ token: re.accessToken });
    expect(verified.role).toBe('admin');
  });
});
