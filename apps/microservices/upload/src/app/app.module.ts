import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import type { StorageStrategy } from '@icore/shared';
import { StorageController } from './storage.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [StorageController],
  providers: [
    {
      provide: 'StorageStrategy',
      useFactory: (cfg: ConfigService): StorageStrategy => {
        const provider = cfg.getOrThrow<string>('STORAGE_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseStorageStrategy({
              client,
              bucket: cfg.getOrThrow<string>('SUPABASE_STORAGE_BUCKET'),
            });
          }
          default:
            throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
