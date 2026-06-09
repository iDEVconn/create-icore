import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { MongoDbAuthStrategy } from './mongodb-auth.strategy';

export const MONGODB_AUTH_REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];

@Module({})
export class MongoDbAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbAuthModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new MongoDbAuthStrategy({
                  connection,
                  jwtSecret: cfg.getOrThrow<string>('JWT_SECRET'),
                }),
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
