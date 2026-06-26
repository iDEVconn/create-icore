import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { buildStrategyWithFallback, FakeAuthStrategy } from '@icore/shared';
import type { AuthStrategy } from '@icore/shared';
import { FirebaseAuthStrategy } from './firebase-auth.strategy';
import { HttpIdentityToolkitClient } from './identity-toolkit.client';

export const FIREBASE_AUTH_REQUIRED_ENV = [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'];

@Module({})
export class FirebaseAuthModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirebaseAuthModule,
      providers: [
        {
          provide: 'AuthStrategy',
          useFactory: (cfg: ConfigService): AuthStrategy =>
            buildStrategyWithFallback<AuthStrategy>({
              service: 'auth MS',
              provider: 'firebase',
              requiredEnv: FIREBASE_AUTH_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const app = getFirebaseAdmin(cfg);
                const identityToolkit = new HttpIdentityToolkitClient(
                  cfg.getOrThrow<string>('FIREBASE_WEB_API_KEY'),
                );
                return new FirebaseAuthStrategy({ identityToolkit, adminAuth: getAuth(app) });
              },
              fake: () => new FakeAuthStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['AuthStrategy'],
    };
  }
}
