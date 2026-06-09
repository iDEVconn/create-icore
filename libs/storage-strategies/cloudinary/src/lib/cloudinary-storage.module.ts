import { Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { buildStrategyWithFallback, FakeStorageStrategy } from '@icore/shared';
import type { StorageStrategy } from '@icore/shared';
import { CloudinaryStorageStrategy, type CloudinaryApiLike } from './cloudinary-storage.strategy';

export const CLOUDINARY_STORAGE_REQUIRED_ENV = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

@Module({})
export class CloudinaryStorageModule {
  static forRoot(envPath: string): DynamicModule {
    return {
      module: CloudinaryStorageModule,
      providers: [
        {
          provide: 'StorageStrategy',
          useFactory: (cfg: ConfigService): StorageStrategy =>
            buildStrategyWithFallback<StorageStrategy>({
              service: 'upload MS',
              provider: 'cloudinary',
              requiredEnv: CLOUDINARY_STORAGE_REQUIRED_ENV,
              cfg,
              envPath,
              build: () => {
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
                          else
                            resolve({ public_id: result.public_id, secure_url: result.secure_url });
                        },
                      );
                      stream.end(buffer);
                    });
                  },
                  async destroy(publicId) {
                    await cloudinary.uploader.destroy(publicId);
                  },
                  privateDownloadUrl(publicId, format, opts) {
                    return cloudinary.utils.private_download_url(
                      publicId,
                      format ?? '',
                      opts ?? {},
                    );
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
