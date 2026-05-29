import { runDBContract } from '@icore/shared';
import { SupabaseDBStrategy } from '../supabase-db.strategy';
import { createMockSupabaseDB } from '../testing/mock-supabase-postgres';

runDBContract('SupabaseDBStrategy', () => {
  const client = createMockSupabaseDB();
  return new SupabaseDBStrategy({ client });
});
