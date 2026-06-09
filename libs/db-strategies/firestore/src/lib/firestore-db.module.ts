import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { buildStrategyWithFallback, FakeDBStrategy } from '@icore/shared';
import type { DBStrategy } from '@icore/shared';
import { FirestoreDBStrategy } from './firestore-db.strategy';

export const FIRESTORE_DB_REQUIRED_ENV = [...FIREBASE_ADMIN_REQUIRED_ENV];

@Module({})
export class FirestoreDbModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirestoreDbModule,
      providers: [
        {
          provide: 'DBStrategy',
          useFactory: (cfg: ConfigService): DBStrategy =>
            buildStrategyWithFallback<DBStrategy>({
              service: 'notes MS',
              provider: 'firestore',
              requiredEnv: FIRESTORE_DB_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const app = getFirebaseAdmin(cfg);
                return new FirestoreDBStrategy({
                  db: app.firestore() as unknown as ConstructorParameters<
                    typeof FirestoreDBStrategy
                  >[0]['db'],
                });
              },
              fake: () => new FakeDBStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['DBStrategy'],
    };
  }
}
