import { describe, it, expect, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAuthModule, FIREBASE_AUTH_REQUIRED_ENV } from '../firebase-auth.module.js';

// Mirrors the production setup where the auth MS registers a global
// ConfigModule, so the dynamic module's useFactory can inject ConfigService.
function globalConfig(get: (k: string) => string | undefined) {
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: {
          get,
          getOrThrow: (k: string) => {
            const v = get(k);
            if (v === undefined) throw new Error(`missing ${k}`);
            return v;
          },
        },
      },
    ],
    exports: [ConfigService],
  })
  class StubConfigModule {}
  return StubConfigModule;
}

describe('FirebaseAuthModule', () => {
  it('requires the firebase-admin env plus the web api key', () => {
    expect(FIREBASE_AUTH_REQUIRED_ENV).toContain('FIREBASE_WEB_API_KEY');
    expect(FIREBASE_AUTH_REQUIRED_ENV).toContain('FB_ADMIN_PROJECT_ID');
  });

  it('falls back to the fake (dev) when env is missing, without touching firebase-admin', async () => {
    process.env['NODE_ENV'] = 'development';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ref = await Test.createTestingModule({
      imports: [globalConfig(() => undefined), FirebaseAuthModule.forRoot('.env')],
    }).compile();
    // Fake strategy still satisfies the AuthStrategy contract (has verifyToken).
    expect(typeof (ref.get('AuthStrategy') as { verifyToken: unknown }).verifyToken).toBe(
      'function',
    );
    delete process.env['NODE_ENV'];
  });
});
