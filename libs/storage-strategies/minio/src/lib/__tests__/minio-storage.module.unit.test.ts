import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MinioStorageModule, MINIO_STORAGE_REQUIRED_ENV } from '../minio-storage.module.js';
import { MinioStorageStrategy } from '../minio-storage.strategy.js';

let ENV: Record<string, string | undefined> = {};
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: { get: (k: string) => ENV[k], getOrThrow: (k: string) => ENV[k] },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('MinioStorageModule', () => {
  it('declares its required env', () => {
    expect(MINIO_STORAGE_REQUIRED_ENV).toEqual([
      'MINIO_ENDPOINT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'MINIO_BUCKET',
    ]);
  });

  it('provides a real MinioStorageStrategy when env present', async () => {
    ENV = {
      MINIO_ENDPOINT: 'localhost',
      MINIO_ACCESS_KEY: 'a',
      MINIO_SECRET_KEY: 's',
      MINIO_BUCKET: 'icore-uploads',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, MinioStorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(MinioStorageStrategy);
  });
});
