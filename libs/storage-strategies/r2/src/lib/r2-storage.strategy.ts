import { randomUUID } from 'node:crypto';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

// Narrowed surface over Cloudflare R2 (S3 API). The upload MS wires the real
// `createR2S3Client(...)`; tests wire an in-memory fake. `listKeys` must
// return EVERY matching key (the real client follows ContinuationToken).
export interface R2ClientLike {
  putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(bucket: string, key: string): Promise<void>;
  presignGetObject(bucket: string, key: string, expiresInSec: number): Promise<string>;
  listKeys(bucket: string, prefix: string): Promise<string[]>;
}

export interface R2StorageStrategyOptions {
  client: R2ClientLike;
  bucket: string;
}

const DEFAULT_TTL_SEC = 900;
// S3 SigV4 presigned URLs cannot outlive 7 days.
const MAX_TTL_SEC = 604800;

// Replaces path separators and control characters so a filename can never
// add or traverse key segments.
function sanitizeFilename(name: string): string {
  return Array.from(name, (ch) => {
    const code = ch.charCodeAt(0);
    return ch === '/' || ch === '\\' || code < 0x20 || code === 0x7f ? '_' : ch;
  }).join('');
}

export class R2StorageStrategy implements StorageStrategy {
  private readonly client: R2ClientLike;
  private readonly bucket: string;

  constructor(opts: R2StorageStrategyOptions) {
    this.client = opts.client;
    this.bucket = opts.bucket;
  }

  // The bucket is never created here: R2 buckets are provisioned in the
  // Cloudflare dashboard, so a missing bucket surfaces as the provider's
  // own error on upload.
  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const filename = sanitizeFilename(file.filename);
    const path = `${userId}/${randomUUID()}-${filename}`;
    await this.client.putObject(this.bucket, path, file.buffer, file.mimeType);
    return { bucket: this.bucket, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    await this.client.deleteObject(this.bucket, ref.path);
  }

  async getSignedUrl(
    userId: string,
    ref: StorageRef,
    ttlSec: number = DEFAULT_TTL_SEC,
  ): Promise<string> {
    this.assertOwner(userId, ref);
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) throw new Error('invalid_ttl');
    // X-Amz-Expires must be an integer; floor can reach 0 for 0 < ttl < 1.
    const ttl = Math.min(Math.floor(ttlSec), MAX_TTL_SEC);
    if (ttl < 1) throw new Error('invalid_ttl');
    return this.client.presignGetObject(this.bucket, ref.path, ttl);
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const keys = await this.client.listKeys(this.bucket, `${folder}/`);
    return keys.map((path) => ({ bucket: this.bucket, path }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    const segments = ref.path.split('/');
    const valid =
      !ref.path.includes('\\') &&
      segments.length >= 2 &&
      segments[0] === userId &&
      segments.every((s) => s !== '' && s !== '.' && s !== '..');
    if (!valid) throw new Error('forbidden');
  }
}
