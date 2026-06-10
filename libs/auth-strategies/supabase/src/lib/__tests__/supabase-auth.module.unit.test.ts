import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthModule, SUPABASE_AUTH_REQUIRED_ENV } from '../supabase-auth.module.js';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy.js';

// Mirrors the production setup where the auth MS registers a global
// ConfigModule, so the dynamic module's useFactory can inject ConfigService.
function globalConfig(env: Record<string, string | undefined>) {
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] },
      },
    ],
    exports: [ConfigService],
  })
  class StubConfigModule {}
  return StubConfigModule;
}

function moduleWith(env: Record<string, string | undefined>) {
  return Test.createTestingModule({
    imports: [globalConfig(env), SupabaseAuthModule.forRoot('.env')],
  }).compile();
}

describe('SupabaseAuthModule', () => {
  it('exposes its required env', () => {
    expect(SUPABASE_AUTH_REQUIRED_ENV).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });

  it('provides a real SupabaseAuthStrategy under the AuthStrategy token when env is present', async () => {
    const ref = await moduleWith({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
    });
    expect(ref.get('AuthStrategy')).toBeInstanceOf(SupabaseAuthStrategy);
  });
});
