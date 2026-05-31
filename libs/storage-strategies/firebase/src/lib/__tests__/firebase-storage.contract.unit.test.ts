import { runStorageContract } from '@icore/shared/testing';
import { FirebaseStorageStrategy } from '../firebase-storage.strategy.js';
import { createMockFirebaseBucket } from '../testing/mock-firebase-storage.js';

runStorageContract('FirebaseStorageStrategy', () => {
  const bucket = createMockFirebaseBucket('icore-uploads');
  return new FirebaseStorageStrategy({ bucket });
});
