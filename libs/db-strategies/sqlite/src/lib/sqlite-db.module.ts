import { Module, DynamicModule, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { SqliteDBStrategy } from './sqlite-db.strategy';
import { parseSqliteEnv } from './sqlite.config';

export const SQLITE_DB_REQUIRED_ENV: string[] = [];

@Module({})
export class SqliteDbModule implements OnModuleDestroy {
  constructor(@Inject('DBStrategy') private readonly strategy: DBStrategy) {}

  static forRoot(envPath: string): DynamicModule {
    return {
      module: SqliteDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'sqlite',
              requiredEnv: SQLITE_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const config = parseSqliteEnv((k) => cfg.get<string>(k));
                return new SqliteDBStrategy(config);
              },
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }

  async onModuleDestroy(): Promise<void> {
    if (
      this.strategy &&
      'close' in this.strategy &&
      typeof (this.strategy as { close: () => Promise<void> }).close === 'function'
    ) {
      await (this.strategy as { close: () => Promise<void> }).close();
    }
  }
}
