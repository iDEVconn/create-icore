import { runAuthContract } from '@icore/shared';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit } from './support/mock-identity-toolkit';
import { createMockAdminAuth } from './support/mock-admin-auth';

runAuthContract('FirebaseAuthStrategy', () => {
  const toolkit = createMockIdentityToolkit();
  const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
  return new FirebaseAuthStrategy({
    identityToolkit: toolkit.client,
    adminAuth,
  });
});
