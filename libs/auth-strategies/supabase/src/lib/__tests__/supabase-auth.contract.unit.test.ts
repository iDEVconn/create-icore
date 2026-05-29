import { runAuthContract } from '@icore/shared';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';
import { createMockSupabaseClient, type MockSupabaseClient } from '../testing/mock-supabase';

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
  },
);
