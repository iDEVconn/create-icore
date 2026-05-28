import type { CloudinaryApiLike, CloudinaryUploadResult } from '../cloudinary-storage.strategy.js';

interface StoredObject {
  bytes: Buffer;
  resourceType: 'image' | 'video' | 'raw';
}

export function createMockCloudinary(): CloudinaryApiLike {
  const objects = new Map<string, StoredObject>();

  return {
    async upload(buffer, opts) {
      const publicId = opts.public_id;
      if (objects.has(publicId)) throw new Error('exists');
      objects.set(publicId, { bytes: buffer, resourceType: opts.resource_type ?? 'raw' });
      return {
        public_id: publicId,
        secure_url: `https://mock.cloudinary/raw/${publicId}`,
      } satisfies CloudinaryUploadResult;
    },
    async destroy(publicId) {
      if (!objects.has(publicId)) throw new Error('not_found');
      objects.delete(publicId);
    },
    privateDownloadUrl(publicId, _format, opts) {
      if (!objects.has(publicId)) throw new Error('not_found');
      return `https://mock.cloudinary/signed/${publicId}?ttl=${opts?.expires_at ?? 'na'}`;
    },
    async resources(opts) {
      const matches = [...objects.keys()].filter((id) =>
        opts.prefix ? id.startsWith(opts.prefix) : true,
      );
      return { resources: matches.map((public_id) => ({ public_id })) };
    },
  };
}
