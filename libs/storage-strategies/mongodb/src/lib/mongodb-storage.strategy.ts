import { Connection, mongo } from 'mongoose';
import { Readable } from 'node:stream';
import { StorageStrategy, StorageRef, FileInput } from '@icore/shared';

export interface MongoDbStorageStrategyOptions {
  connection: Connection;
  bucketName?: string;
}

export class MongoDbStorageStrategy implements StorageStrategy {
  private bucket: mongo.GridFSBucket;

  constructor(private readonly opts: MongoDbStorageStrategyOptions) {
    this.bucket = new mongo.GridFSBucket(this.opts.connection.db as unknown as mongo.Db, {
      bucketName: this.opts.bucketName || 'uploads',
    });
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${file.filename}`;
    const bucket = 'uploads';
    const filename = `${bucket}/${path}`;
    const uploadStream = this.bucket.openUploadStream(filename, {
      metadata: { bucket, path, userId, contentType: file.mimeType },
    });

    return new Promise((resolve, reject) => {
      const readable = new Readable();
      readable.push(file.buffer);
      readable.push(null);
      readable
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => resolve({ bucket, path }));
    });
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    if (!ref.path.startsWith(`${userId}/`)) {
      throw new Error('forbidden: ownership_mismatch');
    }
    const filename = `${ref.bucket}/${ref.path}`;
    const files = await this.bucket.find({ filename }).toArray();
    if (files.length === 0) throw new Error(`not_found: ${filename}`);

    for (const file of files) {
      await this.bucket.delete(file._id);
    }
  }

  async getSignedUrl(userId: string, ref: StorageRef, _ttlSeconds?: number): Promise<string> {
    if (!ref.path.startsWith(`${userId}/`)) {
      throw new Error('forbidden: ownership_mismatch');
    }
    // In GridFS, we don't have built-in signed URLs like S3.
    // For iCore, we proxy GridFS through the Gateway.
    return `/api/storage/file?bucket=${ref.bucket}&path=${ref.path}`;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const userPrefix = prefix ? `${userId}/${prefix}` : `${userId}/`;
    const query: Record<string, unknown> = {
      'metadata.userId': userId,
      'metadata.path': new RegExp('^' + userPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    };

    const files = await this.bucket.find(query).toArray();
    return files.map((file) => ({
      bucket: file.metadata?.['bucket'],
      path: file.metadata?.['path'],
    }));
  }

  async downloadBuffer(userId: string, ref: StorageRef): Promise<Buffer> {
    if (!ref.path.startsWith(`${userId}/`)) {
      throw new Error('forbidden: ownership_mismatch');
    }
    const filename = `${ref.bucket}/${ref.path}`;
    const files = await this.bucket.find({ filename }).toArray();
    if (files.length === 0) throw new Error(`not_found: ${filename}`);

    const fileId = files[0]?._id;
    if (!fileId) throw new Error('not_found');

    const stream = this.bucket.openDownloadStream(fileId as never);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}
