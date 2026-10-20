import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { createD1RestClient } from './d1-client';
import { D1DBStrategy } from './d1-db.strategy';

export const D1_DB_REQUIRED_ENV: string[] = ['D1_ACCOUNT_ID', 'D1_DATABASE_ID', 'D1_API_TOKEN'];

@Module({})
export class D1DbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: D1DbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'd1',
              requiredEnv: D1_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new D1DBStrategy(
                  createD1RestClient({
                    accountId: cfg.getOrThrow<string>('D1_ACCOUNT_ID'),
                    databaseId: cfg.getOrThrow<string>('D1_DATABASE_ID'),
                    apiToken: cfg.getOrThrow<string>('D1_API_TOKEN'),
                  }),
                ),
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
