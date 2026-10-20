import { runStorageContract } from '@icore/shared/testing';
import { R2StorageStrategy, createMockR2 } from '@icore/storage-r2';

runStorageContract('R2StorageStrategy', () => {
  const client = createMockR2();
  return new R2StorageStrategy({ client, bucket: 'icore-uploads' });
});
