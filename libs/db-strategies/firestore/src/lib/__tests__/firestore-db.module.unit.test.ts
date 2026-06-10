import { describe, it, expect, vi } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FirestoreDbModule, FIRESTORE_DB_REQUIRED_ENV } from '../firestore-db.module.js';

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

describe('FirestoreDbModule', () => {
  it('requires the firebase-admin env', () => {
    expect(FIRESTORE_DB_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });
  it('falls back to the fake (dev) when env missing, without touching firebase-admin', async () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, FirestoreDbModule.forRoot('.env')],
    }).compile();
    expect(typeof (ref.get('DBStrategy') as { get: unknown }).get).toBe('function');
    delete process.env.NODE_ENV;
  });
});
