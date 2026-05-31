import { runDBContract } from '@icore/shared/testing';
import { FirestoreDBStrategy, createMockFirestore } from '@icore/db-firestore';

runDBContract('FirestoreDBStrategy', () => {
  const db = createMockFirestore();
  return new FirestoreDBStrategy({ db });
});
