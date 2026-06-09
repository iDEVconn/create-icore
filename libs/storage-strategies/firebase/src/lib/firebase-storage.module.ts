import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import {
  FirebaseStorageStrategy,
  type FirebaseStorageBucketLike,
} from './firebase-storage.strategy';

export const FIREBASE_STORAGE_REQUIRED_ENV = [
  ...FIREBASE_ADMIN_REQUIRED_ENV,
  'FIREBASE_STORAGE_BUCKET',
];

@Module({})
export class FirebaseStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: FirebaseStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'firebase',
              requiredEnv: FIREBASE_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
                const bucketName = cfg.getOrThrow<string>('FIREBASE_STORAGE_BUCKET');
                const app = getFirebaseAdmin(cfg);
                return new FirebaseStorageStrategy({
                  bucket: app.storage().bucket(bucketName) as unknown as FirebaseStorageBucketLike,
                });
              },
              fake: () => new FakeStorageStrategy(),
            }),
          inject: [ConfigService],
        },
      ],
      exports: ['StorageStrategy'],
    };
  }
}
