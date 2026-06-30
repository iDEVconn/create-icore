import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { PostgresAuthStrategy } from './postgres-auth.strategy';

export const POSTGRES_AUTH_REQUIRED_ENV = ['POSTGRES_URL', 'JWT_SECRET'];

@Module({})
export class PostgresAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: PostgresAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'postgres',
              requiredEnv: POSTGRES_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new PostgresAuthStrategy({
                  url: cfg.getOrThrow<string>('POSTGRES_URL'),
                  jwtSecret: cfg.getOrThrow<string>('JWT_SECRET'),
                  jwtExpiresIn: cfg.get<string>('JWT_EXPIRES_IN'),
                  refreshExpiresIn: cfg.get<string>('JWT_REFRESH_EXPIRES_IN'),
                }),
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
