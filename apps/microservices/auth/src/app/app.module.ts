import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';
import type { AuthStrategy } from '@icore/shared';
import { AuthController } from './auth.controller';

function requireEnv(cfg: ConfigService, key: string): string {
  const val = cfg.getOrThrow<string>(key);
  if (!val) throw new Error(`${key} is not set — check apps/microservices/auth/.env`);
  return val;
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
        const provider = requireEnv(cfg, 'AUTH_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              requireEnv(cfg, 'SUPABASE_URL'),
              requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseAuthStrategy({ client });
          }
          case 'firebase':
            return makeFirebaseStrategy(cfg);
          default:
            throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
