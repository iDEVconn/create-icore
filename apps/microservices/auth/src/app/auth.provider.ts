import { SupabaseAuthModule } from '@icore/auth-supabase';

// Auth provider wiring. Selected at scaffold time by create-icore; the committed
// default is supabase (matches AUTH_PROVIDER=supabase in .env.example). The
// chosen XAuthModule.forRoot owns construction, required-env, and the
// dev-fake / prod-fail fallback (see @icore/shared buildStrategyWithFallback).
const ENV_PATH = 'apps/microservices/auth/.env';

export const AuthProviderModule = SupabaseAuthModule.forRoot(ENV_PATH);
