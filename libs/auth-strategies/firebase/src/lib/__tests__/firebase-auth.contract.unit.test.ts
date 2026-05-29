import { randomUUID } from 'node:crypto';
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
      oauth: {
        google: { clientId: 'g-client', clientSecret: 'g-secret' },
        github: { clientId: 'gh-client', clientSecret: 'gh-secret' },
      },
      oauthTokenClient: toolkit.tokenClient,
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
    getOAuthCode: (strategy, _provider, email) => {
      const toolkit = toolkits.get(strategy as FirebaseAuthStrategy);
      if (!toolkit) throw new Error('toolkit not registered for strategy');
      const code = randomUUID();
      toolkit.registerOAuthCode(code, email);
      // The strategy carries its own state ; the contract just needs the code.
      // We round-trip via the strategy's last-issued state by inspecting the
      // pending map, but since it's private, we instead drive completeOAuth
      // with whatever state startOAuth returned. The contract test stores it
      // in a closure variable above the helper call.
      const pending = (
        strategy as unknown as {
          pendingStates: Map<string, { provider: string }>;
        }
      ).pendingStates;
      const state = [...pending.keys()][0];
      if (!state) throw new Error('no pending OAuth state on strategy');
      return { code, state };
    },
  },
);
