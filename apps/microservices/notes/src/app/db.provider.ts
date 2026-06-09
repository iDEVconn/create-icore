import { SupabaseDbModule } from '@icore/db-supabase';

// DB provider wiring. Selected at scaffold time by create-icore; the committed
// default is supabase (matches DB_PROVIDER=supabase in .env.example). The chosen
// XDbModule.forRoot owns construction, required-env, and the dev-fake / prod-fail
// fallback.
const ENV_PATH = 'apps/microservices/notes/.env';

export const DbProviderModule = SupabaseDbModule.forRoot(ENV_PATH);
