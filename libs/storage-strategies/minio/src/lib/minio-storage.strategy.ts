import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

// Narrowed surface of the `minio` SDK's Client — the upload MS wires the real
// `new Client({...})`; tests wire an in-memory fake. listObjects is wrapped
// as a Promise here (the real SDK returns a Readable stream of BucketItem).
export interface MinioClientLike {
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<void>;
  putObject(
    bucket: string,
    objectName: string,
    buffer: Buffer,
    size: number,
    metaData?: Record<string, string>,
  ): Promise<unknown>;
  removeObject(bucket: string, objectName: string): Promise<void>;
  presignedGetObject(bucket: string, objectName: string, expirySec: number): Promise<string>;
  listObjects(bucket: string, prefix: string): Promise<Array<{ name: string }>>;
}

export interface MinioStorageStrategyOptions {
  client: MinioClientLike;
  bucket: string;
}

export class MinioStorageStrategy implements StorageStrategy {
  private readonly client: MinioClientLike;
  private readonly bucket: string;
  private bucketEnsured: Promise<void> | undefined;

  constructor(opts: MinioStorageStrategyOptions) {
    this.client = opts.client;
    this.bucket = opts.bucket;
  }

  // MinIO (unlike Supabase/Firebase) has no dashboard step to pre-create the
  // bucket — lazily create it on first write so a fresh local `docker compose
  // up minio` works without a manual `mc mb` step. Memoized per-instance so
  // concurrent uploads don't race `makeBucket` against each other.
  private ensureBucket(): Promise<void> {
    if (!this.bucketEnsured) {
      this.bucketEnsured = this.client
        .bucketExists(this.bucket)
        .then((exists) => (exists ? undefined : this.client.makeBucket(this.bucket)));
    }
    return this.bucketEnsured;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    await this.ensureBucket();
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    await this.client.putObject(this.bucket, path, file.buffer, file.buffer.length, {
      'Content-Type': file.mimeType,
    });
    return { bucket: this.bucket, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.client.removeObject(this.bucket, ref.path);
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    return this.client.presignedGetObject(this.bucket, ref.path, ttlSec);
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const objects = await this.client.listObjects(this.bucket, `${folder}/`);
    return objects.map((o) => ({ bucket: this.bucket, path: o.name }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }
}
