import type { MinioClientLike } from '../minio-storage.strategy.js';

export function createMockMinio(): MinioClientLike {
  const buckets = new Set<string>();
  const objects = new Map<string, Buffer>();

  return {
    async bucketExists(bucket) {
      return buckets.has(bucket);
    },
    async makeBucket(bucket) {
      buckets.add(bucket);
    },
    async putObject(bucket, objectName, buffer) {
      objects.set(`${bucket}/${objectName}`, buffer);
    },
    async removeObject(bucket, objectName) {
      if (!objects.delete(`${bucket}/${objectName}`)) throw new Error('not_found');
    },
    async presignedGetObject(bucket, objectName, expirySec) {
      if (!objects.has(`${bucket}/${objectName}`)) throw new Error('not_found');
      return `https://mock.minio/${bucket}/${objectName}?ttl=${expirySec}`;
    },
    async listObjects(bucket, prefix) {
      const bucketPrefix = `${bucket}/`;
      return [...objects.keys()]
        .filter(
          (k) => k.startsWith(bucketPrefix) && k.slice(bucketPrefix.length).startsWith(prefix),
        )
        .map((k) => ({ name: k.slice(bucketPrefix.length) }));
    },
  };
}
