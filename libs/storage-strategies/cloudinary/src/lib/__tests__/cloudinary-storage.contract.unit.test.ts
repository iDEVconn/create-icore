import { runStorageContract } from '@icore/shared';
import { CloudinaryStorageStrategy } from '../cloudinary-storage.strategy.js';
import { createMockCloudinary } from '../testing/mock-cloudinary.js';

runStorageContract('CloudinaryStorageStrategy', () => {
  const api = createMockCloudinary();
  return new CloudinaryStorageStrategy({ api, bucket: 'icore-uploads' });
});
