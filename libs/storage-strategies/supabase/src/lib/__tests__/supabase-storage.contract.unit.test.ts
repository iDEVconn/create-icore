import { runStorageContract } from '@icore/shared/testing';
import { SupabaseStorageStrategy } from '../supabase-storage.strategy';
import { createMockSupabaseStorageClient } from '../testing/mock-supabase-storage';

runStorageContract('SupabaseStorageStrategy', () => {
  const client = createMockSupabaseStorageClient('icore-uploads');
  return new SupabaseStorageStrategy({ client, bucket: 'icore-uploads' });
});
