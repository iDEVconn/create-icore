import { runStorageContract } from '@icore/shared/testing';
import { CloudinaryStorageStrategy, createMockCloudinary } from '@icore/storage-cloudinary';

runStorageContract('CloudinaryStorageStrategy', () => {
  const api = createMockCloudinary();
  return new CloudinaryStorageStrategy({ api, bucket: 'icore-uploads' });
});
