import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { MinioStorageStrategy, type MinioClientLike } from './minio-storage.strategy';

export const MINIO_STORAGE_REQUIRED_ENV = [
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
];

@Module({})
export class MinioStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: MinioStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'minio',
              requiredEnv: MINIO_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const client = new Client({
                  endPoint: cfg.getOrThrow<string>('MINIO_ENDPOINT'),
                  port: cfg.get<number>('MINIO_PORT') ?? 9000,
                  useSSL: cfg.get<string>('MINIO_USE_SSL') === 'true',
                  accessKey: cfg.getOrThrow<string>('MINIO_ACCESS_KEY'),
                  secretKey: cfg.getOrThrow<string>('MINIO_SECRET_KEY'),
                });
                const wrapped: MinioClientLike = {
                  bucketExists: (bucket) => client.bucketExists(bucket),
                  makeBucket: (bucket) => client.makeBucket(bucket),
                  putObject: (bucket, objectName, buffer, size, metaData) =>
                    client.putObject(bucket, objectName, buffer, size, metaData),
                  removeObject: (bucket, objectName) => client.removeObject(bucket, objectName),
                  presignedGetObject: (bucket, objectName, expirySec) =>
                    client.presignedGetObject(bucket, objectName, expirySec),
                  listObjects: (bucket, prefix) =>
                    new Promise((resolve, reject) => {
                      const items: Array<{ name: string }> = [];
                      const stream = client.listObjectsV2(bucket, prefix, true);
                      stream.on('data', (item: { name?: string }) => {
                        if (item.name) items.push({ name: item.name });
                      });
                      stream.on('end', () => resolve(items));
                      stream.on('error', reject);
                    }),
                };
                return new MinioStorageStrategy({
                  client: wrapped,
                  bucket: cfg.getOrThrow<string>('MINIO_BUCKET'),
                });
              },
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
