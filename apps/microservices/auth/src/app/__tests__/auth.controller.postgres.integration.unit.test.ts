import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { createMockPostgresAuth } from '@icore/auth-postgres';
import { AuthController } from '../auth.controller';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('AuthController × PostgresAuthStrategy × role-on-first-token', () => {
  const fixture = (env: Record<string, string | undefined> = {}) => {
    const strategy = createMockPostgresAuth();
    return { strategy, controller: new AuthController(strategy, makeConfig(env)) };
  };

  it('signup: the FIRST accessToken already carries the role assignInitialRole just wrote', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'boss@x.com', password: 'pw12345!' });
    const verified = await strategy.verifyToken(session.accessToken);
    expect(verified.role).toBe('admin');
  });

  it('signup: non-admin email also gets its role baked into the first token', async () => {
    const { strategy, controller } = fixture({ ADMINS_LIST: 'boss@x.com' });
    const session = await controller.signup({ email: 'normal@x.com', password: 'pw12345!' });
    const verified = await strategy.verifyToken(session.accessToken);
    expect(verified.role).toBe('user');
  });
});
