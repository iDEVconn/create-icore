import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
}

export interface CloudinaryApiLike {
  upload(
    buffer: Buffer,
    opts: { public_id: string; resource_type?: 'image' | 'video' | 'raw' },
  ): Promise<CloudinaryUploadResult>;
  destroy(publicId: string): Promise<void>;
  privateDownloadUrl(
    publicId: string,
    format: string | undefined,
    opts?: { expires_at?: number },
  ): string;
  resources(opts: { prefix?: string; type?: string }): Promise<{
    resources: Array<{ public_id: string }>;
  }>;
}

export interface CloudinaryStorageStrategyOptions {
  api: CloudinaryApiLike;
  bucket: string; // Cloudinary doesn't have buckets; we synthesize the ref.bucket field
}

export class CloudinaryStorageStrategy implements StorageStrategy {
  private readonly api: CloudinaryApiLike;
  private readonly bucket: string;

  constructor(opts: CloudinaryStorageStrategyOptions) {
    this.api = opts.api;
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const publicId = `${userId}/${randomUUID()}-${file.filename}`;
    const result = await this.api.upload(file.buffer, {
      public_id: publicId,
      resource_type: this.detectResourceType(file.mimeType),
    });
    return { bucket: this.bucket, path: result.public_id };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.api.destroy(ref.path);
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    return this.api.privateDownloadUrl(ref.path, undefined, {
      expires_at: Math.floor(Date.now() / 1000) + ttlSec,
    });
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const { resources } = await this.api.resources({ prefix: `${folder}/` });
    return resources.map((r) => ({ bucket: this.bucket, path: r.public_id }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }

  private detectResourceType(mimeType: string): 'image' | 'video' | 'raw' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'raw';
  }
}
