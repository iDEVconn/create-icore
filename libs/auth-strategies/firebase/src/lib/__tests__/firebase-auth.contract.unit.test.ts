import { runAuthContract } from '@icore/shared';
import { FirebaseAuthStrategy } from '../firebase-auth.strategy';
import { createMockIdentityToolkit, type MockHandle } from '../testing/mock-identity-toolkit';
import { createMockAdminAuth } from '../testing/mock-admin-auth';

const toolkits = new WeakMap<FirebaseAuthStrategy, MockHandle>();

runAuthContract(
  'FirebaseAuthStrategy',
  () => {
    const toolkit = createMockIdentityToolkit();
    const adminAuth = createMockAdminAuth({ identityToolkit: toolkit });
    const strategy = new FirebaseAuthStrategy({
      identityToolkit: toolkit.client,
      adminAuth,
    });
    toolkits.set(strategy, toolkit);
    return strategy;
  },
  {
    getMagicLinkToken: (strategy, email) => {
      const toolkit = toolkits.get(strategy as FirebaseAuthStrategy);
      if (!toolkit) throw new Error('toolkit not registered for strategy');
      const oobCode = toolkit.getOobCode(email);
      const emailB64 = Buffer.from(email, 'utf8').toString('base64');
      return `${emailB64}:${oobCode}`;
    },
  },
);
