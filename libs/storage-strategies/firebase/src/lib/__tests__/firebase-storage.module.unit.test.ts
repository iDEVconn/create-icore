import { describe, it, expect, vi } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  FirebaseStorageModule,
  FIREBASE_STORAGE_REQUIRED_ENV,
} from '../firebase-storage.module.js';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: () => undefined,
        getOrThrow: () => {
          throw new Error('missing');
        },
      },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe('FirebaseStorageModule', () => {
  it('requires firebase-admin env + the storage bucket', () => {
    expect(FIREBASE_STORAGE_REQUIRED_ENV).toContain('FIREBASE_STORAGE_BUCKET');
    expect(FIREBASE_STORAGE_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });

  it('falls back to the fake (dev) when env is missing, without touching firebase-admin', async () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, FirebaseStorageModule.forRoot('.env')],
    }).compile();
    expect(typeof (ref.get('StorageStrategy') as { upload: unknown }).upload).toBe('function');
    delete process.env.NODE_ENV;
  });
});
