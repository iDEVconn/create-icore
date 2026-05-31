import { runDBContract } from '@icore/shared/testing';
import { SupabaseDBStrategy, createMockSupabaseDB } from '@icore/db-supabase';

runDBContract('SupabaseDBStrategy', () => {
  const client = createMockSupabaseDB();
  return new SupabaseDBStrategy({ client });
});
