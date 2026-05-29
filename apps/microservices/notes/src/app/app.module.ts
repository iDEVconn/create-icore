import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseDBStrategy } from '@icore/db-supabase';
import { FirestoreDBStrategy } from '@icore/db-firestore';
import type { DBStrategy } from '@icore/shared';
import { NotesController } from './notes.controller';

function requireEnv(cfg: ConfigService, key: string): string {
  const val = cfg.getOrThrow<string>(key);
  if (!val) throw new Error(`${key} is not set — check apps/microservices/notes/.env`);
  return val;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/notes/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [NotesController],
  providers: [
    {
      provide: 'DBStrategy',
      useFactory: (cfg: ConfigService): DBStrategy => {
        const provider = requireEnv(cfg, 'DB_PROVIDER');
        if (provider === 'supabase') {
          const client = createClient(
            requireEnv(cfg, 'SUPABASE_URL'),
            requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseDBStrategy({ client });
        }
        if (provider === 'firestore' || provider === 'firebase') {
          if (admin.apps.length === 0) {
            admin.initializeApp({
              credential: admin.credential.cert({
                projectId: requireEnv(cfg, 'FB_ADMIN_PROJECT_ID'),
                clientEmail: requireEnv(cfg, 'FB_ADMIN_CLIENT_EMAIL'),
                privateKey: requireEnv(cfg, 'FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
              }),
            });
          }
          return new FirestoreDBStrategy({
            db: admin.firestore() as unknown as ConstructorParameters<
              typeof FirestoreDBStrategy
            >[0]['db'],
          });
        }
        throw new Error(`Unsupported DB_PROVIDER: ${provider}`);
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
