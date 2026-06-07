export interface StorageRef {
  bucket: string;
  path: string;
}

export interface FileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface StorageStrategy {
  upload(userId: string, file: FileInput): Promise<StorageRef>;
  remove(userId: string, ref: StorageRef): Promise<void>;
  getSignedUrl(userId: string, ref: StorageRef, ttlSec?: number): Promise<string>;
  list(userId: string, prefix?: string): Promise<StorageRef[]>;
  /** Providers that can't issue real signed URLs (e.g. GridFS) implement this
   *  so the gateway can proxy the file. Returns undefined for other providers. */
  downloadBuffer?(userId: string, ref: StorageRef): Promise<Buffer>;
}
