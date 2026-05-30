import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseDBStrategy } from '@icore/db-supabase';
import { FirestoreDBStrategy } from '@icore/db-firestore';
import { FakeDBStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { Logger } from '@nestjs/common';
import { NotesController } from './notes.controller';

const ENV_PATH = 'apps/microservices/notes/.env';

// DB_PROVIDER accepts supabase | firestore | firebase (latter two are Firestore).
const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  firestore: ['FB_ADMIN_PROJECT_ID', 'FB_ADMIN_CLIENT_EMAIL', 'FB_ADMIN_PRIVATE_KEY'],
  firebase: ['FB_ADMIN_PROJECT_ID', 'FB_ADMIN_CLIENT_EMAIL', 'FB_ADMIN_PRIVATE_KEY'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
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
        const logger = new Logger('DBStrategy');
        const provider = cfg.get<string>('DB_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        if (!keys || missing.length > 0) {
          const banner = formatEnvBanner({
            service: 'notes MS',
            provider,
            missing,
            envPath: ENV_PATH,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeDBStrategy();
        }

        if (provider === 'supabase') {
          const client = createClient(
            requireEnv(cfg, 'SUPABASE_URL'),
            requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseDBStrategy({ client });
        }
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
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
