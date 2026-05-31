import { runStorageContract } from '@icore/shared/testing';
import { FirebaseStorageStrategy, createMockFirebaseBucket } from '@icore/storage-firebase';

runStorageContract('FirebaseStorageStrategy', () => {
  const bucket = createMockFirebaseBucket('icore-uploads');
  return new FirebaseStorageStrategy({ bucket });
});
