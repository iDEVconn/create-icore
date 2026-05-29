import type { FileInput, StorageRef, StorageStrategy } from '../storage';

interface StoredFile {
  ownerId: string;
  ref: StorageRef;
  bytes: Buffer;
  mimeType: string;
}

export class FakeStorageStrategy implements StorageStrategy {
  private readonly bucket = 'fake-bucket';
  private readonly files = new Map<string, StoredFile>();

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${globalThis.crypto.randomUUID()}-${file.filename}`;
    const ref: StorageRef = { bucket: this.bucket, path };
    this.files.set(this.key(ref), {
      ownerId: userId,
      ref,
      bytes: file.buffer,
      mimeType: file.mimeType,
    });
    return ref;
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    const file = this.files.get(this.key(ref));
    if (!file) throw new Error('not_found');
    if (file.ownerId !== userId) throw new Error('forbidden');
    this.files.delete(this.key(ref));
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    const file = this.files.get(this.key(ref));
    if (!file) throw new Error('not_found');
    if (file.ownerId !== userId) throw new Error('forbidden');
    return `fake://${ref.bucket}/${ref.path}?ttl=${ttlSec}`;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    return [...this.files.values()]
      .filter((f) => f.ownerId === userId)
      .filter((f) => (prefix ? f.ref.path.startsWith(prefix) : true))
      .map((f) => f.ref);
  }

  private key(ref: StorageRef): string {
    return `${ref.bucket}::${ref.path}`;
  }
}
