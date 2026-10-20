import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { R2StorageStrategy } from './r2-storage.strategy';
import { createR2S3Client } from './r2-s3-client';

export const R2_STORAGE_REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
];

@Module({})
export class R2StorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: R2StorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'r2',
              requiredEnv: R2_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new R2StorageStrategy({
                  client: createR2S3Client({
                    accountId: cfg.getOrThrow<string>('R2_ACCOUNT_ID'),
                    accessKeyId: cfg.getOrThrow<string>('R2_ACCESS_KEY_ID'),
                    secretAccessKey: cfg.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
                  }),
                  bucket: cfg.getOrThrow<string>('R2_BUCKET'),
                }),
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
