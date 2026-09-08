-- Generic DBStrategy collection table (id/data), same shape every other
-- Supabase-backed collection in this repo uses (see SupabaseDBStrategy) — NOT
-- a bespoke schema. Backs AiUsageService's `ai_usage_records` collection
-- (apps/microservices/ai-orchestrator/src/app/ai-usage.service.ts), written
-- via ai-usage-db.provider.ts independent of the notes demo's own db axis.
create table if not exists ai_usage_records (
  id text primary key,
  data jsonb not null
);

create index if not exists ai_usage_records_timestamp_idx
  on ai_usage_records ((data->>'timestamp'));
create index if not exists ai_usage_records_user_id_idx
  on ai_usage_records ((data->>'user_id'));
