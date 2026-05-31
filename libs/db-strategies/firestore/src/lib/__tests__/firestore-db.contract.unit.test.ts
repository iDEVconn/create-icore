import { runDBContract } from '@icore/shared/testing';
import { FirestoreDBStrategy } from '../firestore-db.strategy';
import { createMockFirestore } from '../testing/mock-firestore';

runDBContract('FirestoreDBStrategy', () => {
  const db = createMockFirestore();
  return new FirestoreDBStrategy({ db });
});
