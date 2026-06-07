import { join } from 'node:path';
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { MongoDbAuthStrategy } from '@icore/auth-mongodb';
import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { FakeAuthStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { AuthController } from './auth.controller';

const ENV_PATH = 'apps/microservices/auth/.env';

// Env vars each provider needs (besides AUTH_PROVIDER itself).
const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'],
  mongodb: ['MONGODB_URI', 'JWT_SECRET'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeSupabaseAuth(cfg: ConfigService): AuthStrategy {
  const client = createClient(
    requireEnv(cfg, 'SUPABASE_URL'),
    requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return new SupabaseAuthStrategy({ client });
}

function makeFirebaseAuth(cfg: ConfigService): AuthStrategy {
  const app = getFirebaseAdmin(cfg);
  const identityToolkit = new HttpIdentityToolkitClient(requireEnv(cfg, 'FIREBASE_WEB_API_KEY'));
  return new FirebaseAuthStrategy({
    identityToolkit,
    adminAuth: app.auth(),
  });
}

function makeMongoDbAuth(connection: Connection, cfg: ConfigService): AuthStrategy {
  return new MongoDbAuthStrategy({
    connection,
    jwtSecret: requireEnv(cfg, 'JWT_SECRET'),
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/auth/.env'),
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
  controllers: [AuthController],
  providers: [
    {
      provide: 'AuthStrategy',
      useFactory: (cfg: ConfigService, connection: Connection): AuthStrategy => {
        const logger = new Logger('AuthStrategy');
        const provider = cfg.get<string>('AUTH_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        // Prod: fail fast — never silently run a fake auth strategy.
        // Dev: warn with a boxed banner + fall back to the in-memory fake.
        const fallback = (reason?: string): AuthStrategy => {
          const banner = formatEnvBanner({
            service: 'auth MS',
            provider,
            missing,
            envPath: ENV_PATH,
            reason,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeAuthStrategy();
        };

        if (!keys || missing.length > 0) return fallback();

        try {
          if (provider === 'supabase') return makeSupabaseAuth(cfg);
          if (provider === 'mongodb') return makeMongoDbAuth(connection, cfg);
          return makeFirebaseAuth(cfg);
        } catch (err) {
          // Vars present but invalid (e.g. placeholder URL the SDK rejects).
          return fallback(err instanceof Error ? err.message : String(err));
        }
      },
      inject: [ConfigService, getConnectionToken()],
    },
  ],
})
export class AppModule {}
