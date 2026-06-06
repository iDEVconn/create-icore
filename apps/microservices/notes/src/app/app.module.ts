import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseDBStrategy } from '@icore/db-supabase';
import { MongoDbDBStrategy } from '@icore/db-mongodb';
import { FirestoreDBStrategy } from '@icore/db-firestore';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { FakeDBStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { NotesController } from './notes.controller';

const ENV_PATH = 'apps/microservices/notes/.env';

// DB_PROVIDER accepts supabase | firestore | firebase (latter two are Firestore).
const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  firestore: [...FIREBASE_ADMIN_REQUIRED_ENV],
  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV],
  mongodb: ['MONGODB_URI'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeSupabaseDB(cfg: ConfigService): DBStrategy {
  const client = createClient(
    requireEnv(cfg, 'SUPABASE_URL'),
    requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return new SupabaseDBStrategy({ client });
}

function makeFirestoreDB(cfg: ConfigService): DBStrategy {
  const app = getFirebaseAdmin(cfg);
  return new FirestoreDBStrategy({
    db: app.firestore() as unknown as ConstructorParameters<typeof FirestoreDBStrategy>[0]['db'],
  });
}

function makeMongoDb(connection: Connection): DBStrategy {
  return new MongoDbDBStrategy({ connection });
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
    MongooseModule.forRootAsync({
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [NotesController],
  providers: [
    {
      provide: 'DBStrategy',
      useFactory: (cfg: ConfigService, connection: Connection): DBStrategy => {
        const logger = new Logger('DBStrategy');
        const provider = cfg.get<string>('DB_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        const fallback = (reason?: string): DBStrategy => {
          const banner = formatEnvBanner({
            service: 'notes MS',
            provider,
            missing,
            envPath: ENV_PATH,
            reason,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeDBStrategy();
        };

        if (!keys || missing.length > 0) return fallback();

        try {
          if (provider === 'supabase') return makeSupabaseDB(cfg);
          if (provider === 'mongodb') return makeMongoDb(connection);
          return makeFirestoreDB(cfg);
        } catch (err) {
          return fallback(err instanceof Error ? err.message : String(err));
        }
      },
      inject: [ConfigService, getConnectionToken()],
    },
  ],
})
export class AppModule {}
