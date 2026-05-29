import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseDBStrategy } from '@icore/db-supabase';
import { FirestoreDBStrategy } from '@icore/db-firestore';
import type { DBStrategy } from '@icore/shared';
import { NotesController } from './notes.controller';

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
        const provider = cfg.getOrThrow<string>('DB_PROVIDER');
        if (provider === 'supabase') {
          const client = createClient(
            cfg.getOrThrow<string>('SUPABASE_URL'),
            cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseDBStrategy({ client });
        }
        if (provider === 'firestore' || provider === 'firebase') {
          if (admin.apps.length === 0) {
            admin.initializeApp({
              credential: admin.credential.cert({
                projectId: cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID'),
                clientEmail: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
                privateKey: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
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
