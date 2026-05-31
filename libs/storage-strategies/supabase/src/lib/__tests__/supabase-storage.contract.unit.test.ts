import { runStorageContract } from '@icore/shared/testing';
import { SupabaseStorageStrategy, createMockSupabaseStorageClient } from '@icore/storage-supabase';

runStorageContract('SupabaseStorageStrategy', () => {
  const client = createMockSupabaseStorageClient('icore-uploads');
  return new SupabaseStorageStrategy({ client, bucket: 'icore-uploads' });
});
