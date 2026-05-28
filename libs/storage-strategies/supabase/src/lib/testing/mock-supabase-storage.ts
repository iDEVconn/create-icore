import type { SupabaseClient } from '@supabase/supabase-js';

interface StoredObject {
  bytes: Buffer;
  mimeType: string;
}

interface MockBucketHandle {
  upload(
    path: string,
    body: Buffer,
    opts?: { contentType?: string },
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  createSignedUrl(
    path: string,
    ttlSec: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
  list(
    prefix?: string,
  ): Promise<{ data: Array<{ name: string }> | null; error: { message: string } | null }>;
}

export function createMockSupabaseStorageClient(bucket = 'icore-uploads'): SupabaseClient {
  const objects = new Map<string, StoredObject>();

  function bucketHandle(name: string): MockBucketHandle {
    if (name !== bucket) {
      return {
        async upload() {
          return { data: null, error: { message: `unknown_bucket:${name}` } };
        },
        async remove() {
          return { data: null, error: { message: `unknown_bucket:${name}` } };
        },
        async createSignedUrl() {
          return { data: null, error: { message: `unknown_bucket:${name}` } };
        },
        async list() {
          return { data: null, error: { message: `unknown_bucket:${name}` } };
        },
      };
    }
    return {
      async upload(path, body, opts) {
        if (objects.has(path)) return { data: null, error: { message: 'duplicate' } };
        objects.set(path, {
          bytes: body,
          mimeType: opts?.contentType ?? 'application/octet-stream',
        });
        return { data: { path }, error: null };
      },
      async remove(paths) {
        for (const p of paths) objects.delete(p);
        return { data: null, error: null };
      },
      async createSignedUrl(path, ttlSec) {
        if (!objects.has(path)) return { data: null, error: { message: 'not_found' } };
        return {
          data: { signedUrl: `https://mock.supabase/${path}?ttl=${ttlSec}` },
          error: null,
        };
      },
      async list(prefix) {
        const matches = [...objects.keys()]
          .filter((p) => (prefix ? p.startsWith(prefix) : true))
          .map((name) => ({ name: name.split('/').pop() ?? name }));
        return { data: matches, error: null };
      },
    };
  }

  const storage = {
    from: (name: string) => bucketHandle(name),
  };

  return { storage } as unknown as SupabaseClient;
}
