import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { MongoDbStorageStrategy } from './mongodb-storage.strategy';

export const MONGODB_STORAGE_REQUIRED_ENV = ['MONGODB_URI'];

@Module({})
export class MongoDbStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MongoDbStorageModule,
      imports: [
        MongooseModule.forRootAsync({
          useFactory: (cfg: ConfigService) => ({ uri: cfg.get<string>('MONGODB_URI') }),
          inject: [ConfigService],
        }),
      ],
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService, connection: Connection): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'mongodb',
              requiredEnv: MONGODB_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => new MongoDbStorageStrategy({ connection }),
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService, getConnectionToken()],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
