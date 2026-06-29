import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { PostgresDBStrategy } from './postgres-db.strategy';

export const POSTGRES_DB_REQUIRED_ENV = ['POSTGRES_URL'];

@Module({})
export class PostgresDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: PostgresDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'postgres',
              requiredEnv: POSTGRES_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => new PostgresDBStrategy(cfg.getOrThrow<string>('POSTGRES_URL')),
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
