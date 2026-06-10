import { describe, it, expect } from 'vitest';
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  SupabaseStorageModule,
  SUPABASE_STORAGE_REQUIRED_ENV,
} from '../supabase-storage.module.js';
import { SupabaseStorageStrategy } from '../supabase-storage.strategy.js';

@Global()
@Module({
  providers: [{ provide: ConfigService, useValue: makeCfg() }],
  exports: [ConfigService],
})
class StubConfigModule {}

let ENV: Record<string, string | undefined> = {};
function makeCfg() {
  return {
    get: (k: string) => ENV[k],
    getOrThrow: (k: string) => ENV[k],
  } as unknown as ConfigService;
}

describe('SupabaseStorageModule', () => {
  it('declares its required env', () => {
    expect(SUPABASE_STORAGE_REQUIRED_ENV).toEqual([
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_STORAGE_BUCKET',
    ]);
  });

  it('provides a real SupabaseStorageStrategy under StorageStrategy when env present', async () => {
    ENV = {
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'svc',
      SUPABASE_STORAGE_BUCKET: 'uploads',
    };
    const ref = await Test.createTestingModule({
      imports: [StubConfigModule, SupabaseStorageModule.forRoot('.env')],
    }).compile();
    expect(ref.get('StorageStrategy')).toBeInstanceOf(SupabaseStorageStrategy);
  });
});
