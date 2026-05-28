import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileInput, StorageRef, StorageStrategy } from '@icore/shared';

export interface SupabaseStorageStrategyOptions {
  client: SupabaseClient;
  bucket: string;
}

export class SupabaseStorageStrategy implements StorageStrategy {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(opts: SupabaseStorageStrategyOptions) {
    this.client = opts.client;
    this.bucket = opts.bucket;
  }

  async upload(userId: string, file: FileInput): Promise<StorageRef> {
    const path = `${userId}/${randomUUID()}-${file.filename}`;
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, file.buffer, { contentType: file.mimeType });
    if (error) throw new Error(error.message);
    return { bucket: this.bucket, path };
  }

  async remove(userId: string, ref: StorageRef): Promise<void> {
    this.assertOwner(userId, ref);
    const { error } = await this.client.storage.from(ref.bucket).remove([ref.path]);
    if (error) throw new Error(error.message);
  }

  async getSignedUrl(userId: string, ref: StorageRef, ttlSec = 900): Promise<string> {
    this.assertOwner(userId, ref);
    const { data, error } = await this.client.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, ttlSec);
    if (error || !data) throw new Error(error?.message ?? 'signed_url_failed');
    return data.signedUrl;
  }

  async list(userId: string, prefix?: string): Promise<StorageRef[]> {
    const folder = prefix ? `${userId}/${prefix}` : userId;
    const { data, error } = await this.client.storage.from(this.bucket).list(folder);
    if (error || !data) return [];
    return data.map((row) => ({ bucket: this.bucket, path: `${folder}/${row.name}` }));
  }

  private assertOwner(userId: string, ref: StorageRef): void {
    if (!ref.path.startsWith(`${userId}/`)) throw new Error('forbidden');
  }
}
