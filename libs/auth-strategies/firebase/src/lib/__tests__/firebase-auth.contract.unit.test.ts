import { runAuthContract } from '@icore/shared';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit } from '../testing/mock-identity-toolkit';
import { createMockAdminAuth } from '../testing/mock-admin-auth';

runAuthContract('FirebaseAuthStrategy', () => {
  const toolkit = createMockIdentityToolkit();
  const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
  return new FirebaseAuthStrategy({
    identityToolkit: toolkit.client,
    adminAuth,
  });
});
