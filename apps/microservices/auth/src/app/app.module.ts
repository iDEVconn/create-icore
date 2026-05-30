import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';
import { FakeAuthStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { Logger } from '@nestjs/common';
import { AuthController } from './auth.controller';

const ENV_PATH = 'apps/microservices/auth/.env';

// Env vars each provider needs (besides AUTH_PROVIDER itself).
const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  firebase: [
    'FB_ADMIN_PROJECT_ID',
    'FB_ADMIN_CLIENT_EMAIL',
    'FB_ADMIN_PRIVATE_KEY',
    'FIREBASE_WEB_API_KEY',
  ],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeFirebaseStrategy(cfg: ConfigService): AuthStrategy {
  const projectId = requireEnv(cfg, 'FB_ADMIN_PROJECT_ID');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: requireEnv(cfg, 'FB_ADMIN_CLIENT_EMAIL'),
        privateKey: requireEnv(cfg, 'FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  const identityToolkit = new HttpIdentityToolkitClient(requireEnv(cfg, 'FIREBASE_WEB_API_KEY'));
  return new FirebaseAuthStrategy({
    identityToolkit,
    adminAuth: admin.auth(),
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
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: 'AuthStrategy',
      useFactory: (cfg: ConfigService): AuthStrategy => {
        const logger = new Logger('AuthStrategy');
        const provider = cfg.get<string>('AUTH_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        if (!keys || missing.length > 0) {
          const banner = formatEnvBanner({
            service: 'auth MS',
            provider,
            missing,
            envPath: ENV_PATH,
          });
          // Prod: fail fast — never silently run a fake auth strategy.
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeAuthStrategy();
        }

        if (provider === 'supabase') {
          const client = createClient(
            requireEnv(cfg, 'SUPABASE_URL'),
            requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseAuthStrategy({ client });
        }
        return makeFirebaseStrategy(cfg);
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
