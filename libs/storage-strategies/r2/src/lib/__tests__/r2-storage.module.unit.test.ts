import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { R2StorageModule, R2_STORAGE_REQUIRED_ENV } from '../r2-storage.module.js';
import { R2StorageStrategy } from '../r2-storage.strategy.js';

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

describe('R2StorageModule', () => {
  it('declares its required env', () => {
    expect(R2_STORAGE_REQUIRED_ENV).toEqual([
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ]);
  });

  it('provides a real R2StorageStrategy when env present', async () => {
    ENV = {
      R2_ACCOUNT_ID: 'acc',
      R2_ACCESS_KEY_ID: 'a',
      R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKET: 'icore-uploads',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, R2StorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(R2StorageStrategy);
  });
});
