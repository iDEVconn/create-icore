import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

// Narrowed surfaces of firebase-admin's storage Bucket + File. The upload MS
// wires the real admin.storage().bucket(name); we only need these methods.

export interface FirebaseStorageFileLike {
  save(body: Buffer, opts?: { metadata?: { contentType?: string } }): Promise<void>;
  delete(): Promise<void>;
  getSignedUrl(opts: { action?: 'read'; expires: number }): Promise<[string]>;
}

export interface FirebaseStorageBucketLike {
  name: string;
  file(path: string): FirebaseStorageFileLike;
  getFiles(opts?: { prefix?: string }): Promise<[Array<{ name: string }>]>;
}

export interface FirebaseStorageStrategyOptions {
  bucket: FirebaseStorageBucketLike;
}

export class FirebaseStorageStrategy implements StorageStrategy {
  private readonly bucket: FirebaseStorageBucketLike;

  constructor(opts: FirebaseStorageStrategyOptions) {
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    await this.bucket.file(path).save(file.buffer, {
      metadata: { contentType: file.mimeType },
    });
    return { bucket: this.bucket.name, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.bucket.file(ref.path).delete();
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    const [url] = await this.bucket.file(ref.path).getSignedUrl({
      action: 'read',
      expires: Date.now() + ttlSec * 1000,
    });
    return url;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const [files] = await this.bucket.getFiles({ prefix: `${folder}/` });
    return files
      .filter((f) => f.name !== folder + '/')
      .map((f) => ({ bucket: this.bucket.name, path: f.name }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }
}
