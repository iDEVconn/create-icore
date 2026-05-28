import type {
  FirebaseStorageBucketLike,
  FirebaseStorageFileLike,
} from '../firebase-storage.strategy.js';

interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

export function createMockFirebaseBucket(name = 'icore-uploads'): FirebaseStorageBucketLike {
  const objects = new Map<string, StoredObject>();

  function fileHandle(path: string): FirebaseStorageFileLike {
    return {
      async save(body, opts) {
        objects.set(path, {
          bytes: Buffer.from(body),
          contentType: opts?.metadata?.contentType ?? 'application/octet-stream',
        });
      },
      async delete() {
        if (!objects.has(path)) throw new Error('not_found');
        objects.delete(path);
      },
      async getSignedUrl(opts) {
        if (!objects.has(path)) throw new Error('not_found');
        return [`https://mock.firebasestorage/${name}/${path}?ttl=${opts.expires}`];
      },
    };
  }

  return {
    name,
    file: (path: string) => fileHandle(path),
    async getFiles(opts) {
      const matches = [...objects.keys()].filter((p) =>
        opts?.prefix ? p.startsWith(opts.prefix) : true,
      );
      return [matches.map((p) => ({ name: p }))];
    },
  };
}
