import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { SupabaseAuthStrategy } from '@icore/auth-supabase';
import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';
import type { AuthStrategy } from '@icore/shared';
import { AuthController } from './auth.controller';

function makeFirebaseStrategy(cfg: ConfigService): AuthStrategy {
  const projectId = cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
        privateKey: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  const identityToolkit = new HttpIdentityToolkitClient(
    cfg.getOrThrow<string>('FIREBASE_WEB_API_KEY'),
  );
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
        const provider = cfg.getOrThrow<string>('AUTH_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
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
