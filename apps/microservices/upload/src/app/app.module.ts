import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import { FirebaseStorageStrategy } from '@icore/storage-firebase';
import { CloudinaryStorageStrategy, type CloudinaryApiLike } from '@icore/storage-cloudinary';
import { FakeStorageStrategy, missingEnv, formatEnvBanner } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { Logger } from '@nestjs/common';
import { StorageController } from './storage.controller';

const ENV_PATH = 'apps/microservices/upload/.env';

const REQUIRED_ENV: Record<string, string[]> = {
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'],
  firebase: [
    'FIREBASE_STORAGE_BUCKET',
    'FB_ADMIN_PROJECT_ID',
    'FB_ADMIN_CLIENT_EMAIL',
    'FB_ADMIN_PRIVATE_KEY',
  ],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
};

function requireEnv(cfg: ConfigService, key: string): string {
  return cfg.getOrThrow<string>(key);
}

function makeFirebaseStorage(cfg: ConfigService): StorageStrategy {
  const bucketName = requireEnv(cfg, 'FIREBASE_STORAGE_BUCKET');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: requireEnv(cfg, 'FB_ADMIN_PROJECT_ID'),
        clientEmail: requireEnv(cfg, 'FB_ADMIN_CLIENT_EMAIL'),
        privateKey: requireEnv(cfg, 'FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  }
  return new FirebaseStorageStrategy({
    bucket: admin
      .storage()
      .bucket(bucketName) as unknown as import('@icore/storage-firebase').FirebaseStorageBucketLike,
  });
}

function makeCloudinaryStorage(cfg: ConfigService): StorageStrategy {
  cloudinary.config({
    cloud_name: requireEnv(cfg, 'CLOUDINARY_CLOUD_NAME'),
    api_key: requireEnv(cfg, 'CLOUDINARY_API_KEY'),
    api_secret: requireEnv(cfg, 'CLOUDINARY_API_SECRET'),
    secure: true,
  });

  const api: CloudinaryApiLike = {
    async upload(buffer, opts) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { public_id: opts.public_id, resource_type: opts.resource_type ?? 'raw' },
          (error, result) => {
            if (error || !result) reject(error ?? new Error('upload_failed'));
            else resolve({ public_id: result.public_id, secure_url: result.secure_url });
          },
        );
        stream.end(buffer);
      });
    },
    async destroy(publicId) {
      await cloudinary.uploader.destroy(publicId);
    },
    privateDownloadUrl(publicId, format, opts) {
      return cloudinary.utils.private_download_url(publicId, format ?? '', opts ?? {});
    },
    async resources(opts) {
      const res = await cloudinary.api.resources({
        prefix: opts.prefix,
        type: opts.type ?? 'upload',
      });
      return {
        resources: (res.resources ?? []).map((r: { public_id: string }) => ({
          public_id: r.public_id,
        })),
      };
    },
  };

  return new CloudinaryStorageStrategy({
    api,
    bucket: cfg.get<string>('CLOUDINARY_BUCKET_TAG') ?? 'cloudinary',
  });
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
    }),
  ],
  controllers: [StorageController],
  providers: [
    {
      provide: 'StorageStrategy',
      useFactory: (cfg: ConfigService): StorageStrategy => {
        const logger = new Logger('StorageStrategy');
        const provider = cfg.get<string>('STORAGE_PROVIDER')?.trim();
        const keys = provider ? REQUIRED_ENV[provider] : undefined;
        const missing = keys ? missingEnv((k) => cfg.get<string>(k), keys) : [];

        if (!keys || missing.length > 0) {
          const banner = formatEnvBanner({
            service: 'upload MS',
            provider,
            missing,
            envPath: ENV_PATH,
          });
          if (process.env.NODE_ENV === 'production') throw new Error(banner);
          logger.warn(banner);
          return new FakeStorageStrategy();
        }

        if (provider === 'supabase') {
          const client = createClient(
            requireEnv(cfg, 'SUPABASE_URL'),
            requireEnv(cfg, 'SUPABASE_SERVICE_ROLE_KEY'),
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          return new SupabaseStorageStrategy({
            client,
            bucket: requireEnv(cfg, 'SUPABASE_STORAGE_BUCKET'),
          });
        }
        if (provider === 'firebase') return makeFirebaseStorage(cfg);
        return makeCloudinaryStorage(cfg);
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
