import { SupabaseStorageModule } from '@icore/storage-supabase';

// Storage provider wiring. Selected at scaffold time by create-icore; the
// committed default is supabase (matches STORAGE_PROVIDER=supabase in
// .env.example). The chosen XStorageModule.forRoot owns construction,
// required-env, and the dev-fake / prod-fail fallback.
const ENV_PATH = 'apps/microservices/upload/.env';

export const StorageProviderModule = SupabaseStorageModule.forRoot(ENV_PATH);
