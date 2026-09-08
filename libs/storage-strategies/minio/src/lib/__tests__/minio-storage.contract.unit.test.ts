import { runStorageContract } from '@icore/shared/testing';
import { MinioStorageStrategy, createMockMinio } from '@icore/storage-minio';

runStorageContract('MinioStorageStrategy', () => {
  const client = createMockMinio();
  return new MinioStorageStrategy({ client, bucket: 'icore-uploads' });
});
