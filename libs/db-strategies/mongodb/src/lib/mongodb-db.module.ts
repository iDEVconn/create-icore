import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { MongoDbDBStrategy } from './mongodb-db.strategy';

export const MONGODB_DB_REQUIRED_ENV = ['MONGODB_URI'];

@Module({})
export class MongoDbDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbDbModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => new MongoDbDBStrategy({ connection }),
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
