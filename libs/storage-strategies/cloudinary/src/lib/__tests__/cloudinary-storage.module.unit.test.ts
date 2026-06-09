import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  CloudinaryStorageModule,
  CLOUDINARY_STORAGE_REQUIRED_ENV,
} from '../cloudinary-storage.module.js';
import { CloudinaryStorageStrategy } from '../cloudinary-storage.strategy.js';

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

describe('CloudinaryStorageModule', () => {
  it('declares its required env', () => {
    expect(CLOUDINARY_STORAGE_REQUIRED_ENV).toEqual([
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ]);
  });

  it('provides a real CloudinaryStorageStrategy when env present', async () => {
    ENV = { CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, CloudinaryStorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(CloudinaryStorageStrategy);
  });
});
