import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { SupabaseStorageStrategy } from './supabase-storage.strategy';

export const SUPABASE_STORAGE_REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
];

@Module({})
export class SupabaseStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: SupabaseStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'supabase',
              requiredEnv: SUPABASE_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () =>
                new SupabaseStorageStrategy({
                  client: createClient(
                    cfg.getOrThrow<string>('SUPABASE_URL'),
                    cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
                    { auth: { autoRefreshToken: false, persistSession: false } },
                  ),
                  bucket: cfg.getOrThrow<string>('SUPABASE_STORAGE_BUCKET'),
                }),
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
