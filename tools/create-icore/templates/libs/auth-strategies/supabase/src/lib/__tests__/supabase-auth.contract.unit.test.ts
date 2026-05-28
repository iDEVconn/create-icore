import { runAuthContract } from '@icore/shared';
import { SupabaseAuthStrategy } from '../supabase-auth.strategy';
import { createMockSupabaseClient } from '../testing/mock-supabase';

runAuthContract('SupabaseAuthStrategy', () => {
  const client = createMockSupabaseClient();
  return new SupabaseAuthStrategy({ client });
});
