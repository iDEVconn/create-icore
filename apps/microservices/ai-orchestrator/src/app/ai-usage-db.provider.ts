import { SupabaseDbModule } from '@icore/db-supabase';

// DB provider wiring for AI usage tracking. Selected at scaffold time by
// create-icore, independent of the notes demo's own db.provider.ts — the
// `ai` feature can be chosen with `example=none`. The committed default here
// is supabase (matches DB_PROVIDER=supabase in .env.example); when
// DB_PROVIDER=none, this file is generated as a FakeDBStrategy-backed
// NullDbModule instead (see wire-ai-usage-db.ts).
const ENV_PATH = 'apps/microservices/ai-orchestrator/.env';

export const AiUsageDbProviderModule = SupabaseDbModule.forRoot(ENV_PATH);
