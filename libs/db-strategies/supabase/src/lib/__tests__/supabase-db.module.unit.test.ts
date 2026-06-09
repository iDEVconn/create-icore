import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseDbModule, SUPABASE_DB_REQUIRED_ENV } from '../supabase-db.module.js';
import { SupabaseDBStrategy } from '../supabase-db.strategy.js';

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

describe('SupabaseDbModule', () => {
  it('declares its required env', () => {
    expect(SUPABASE_DB_REQUIRED_ENV).toEqual(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  });
  it('provides a real SupabaseDBStrategy under DBStrategy when env present', async () => {
    ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, SupabaseDbModule.forRoot('.env')],
    }).compile();
    expect(ref.get('DBStrategy')).toBeInstanceOf(SupabaseDBStrategy);
  });
});
