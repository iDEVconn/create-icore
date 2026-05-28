import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { SupabaseStorageStrategy } from '@icore/storage-supabase';
import { FirebaseStorageStrategy } from '@icore/storage-firebase';
import { CloudinaryStorageStrategy, type CloudinaryApiLike } from '@icore/storage-cloudinary';
import type { StorageStrategy } from '@icore/shared';
import { StorageController } from './storage.controller';

function makeFirebaseStorage(cfg: ConfigService): StorageStrategy {
  const bucketName = cfg.getOrThrow<string>('FIREBASE_STORAGE_BUCKET');
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: cfg.getOrThrow<string>('FB_ADMIN_PROJECT_ID'),
        clientEmail: cfg.getOrThrow<string>('FB_ADMIN_CLIENT_EMAIL'),
        privateKey: cfg.getOrThrow<string>('FB_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
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
    cloud_name: cfg.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
    api_key: cfg.getOrThrow<string>('CLOUDINARY_API_KEY'),
    api_secret: cfg.getOrThrow<string>('CLOUDINARY_API_SECRET'),
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
        const provider = cfg.getOrThrow<string>('STORAGE_PROVIDER');
        switch (provider) {
          case 'supabase': {
            const client = createClient(
              cfg.getOrThrow<string>('SUPABASE_URL'),
              cfg.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
              { auth: { autoRefreshToken: false, persistSession: false } },
            );
            return new SupabaseStorageStrategy({
              client,
              bucket: cfg.getOrThrow<string>('SUPABASE_STORAGE_BUCKET'),
            });
          }
          case 'firebase':
            return makeFirebaseStorage(cfg);
          case 'cloudinary':
            return makeCloudinaryStorage(cfg);
          default:
            throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
        }
      },
      inject: [ConfigService],
    },
  ],
})
export class AppModule {}
