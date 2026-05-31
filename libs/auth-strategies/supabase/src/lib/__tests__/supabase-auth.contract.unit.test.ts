import { runAuthContract } from '@icore/shared/testing';
import {
  SupabaseAuthStrategy,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from '@icore/auth-supabase';

const mocks = new WeakMap<SupabaseAuthStrategy, MockSupabaseClient>();

runAuthContract(
  'SupabaseAuthStrategy',
  () => {
    const mock = createMockSupabaseClient();
    const strategy = new SupabaseAuthStrategy({ client: mock.client });
    mocks.set(strategy, mock);
    return strategy;
  },
  {
    getMagicLinkToken: (strategy, email) => {
      const mock = mocks.get(strategy as SupabaseAuthStrategy);
      if (!mock) throw new Error('mock not registered for strategy');
      return mock.getMagicLinkToken(email);
    },
    getOAuthCode: (strategy, provider, email) => {
      const mock = mocks.get(strategy as SupabaseAuthStrategy);
      if (!mock) throw new Error('mock not registered for strategy');
      return mock.getOAuthChallenge(provider, email);
    },
  },
);
