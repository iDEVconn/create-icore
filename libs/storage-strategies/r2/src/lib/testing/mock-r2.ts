import type { R2ClientLike } from '../r2-storage.strategy';

export function createMockR2(): R2ClientLike {
  const objects = new Map<string, Buffer>();

  return {
    async putObject(bucket, key, body) {
      objects.set(`${bucket}/${key}`, body);
    },
    async deleteObject(bucket, key) {
      if (!objects.delete(`${bucket}/${key}`)) throw new Error('not_found');
    },
    async presignGetObject(bucket, key, expiresInSec) {
      if (!objects.has(`${bucket}/${key}`)) throw new Error('not_found');
      return `https://mock.r2/${bucket}/${key}?ttl=${expiresInSec}`;
    },
    async listKeys(bucket, prefix) {
      const bucketPrefix = `${bucket}/`;
      return [...objects.keys()]
        .filter(
          (k) => k.startsWith(bucketPrefix) && k.slice(bucketPrefix.length).startsWith(prefix),
        )
        .map((k) => k.slice(bucketPrefix.length));
    },
  };
}
