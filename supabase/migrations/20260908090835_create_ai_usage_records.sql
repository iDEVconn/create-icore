-- Backs @idevconn/ai-usage's AiUsageDataSource for the ai-orchestrator MS
-- (apps/microservices/ai-orchestrator/src/app/ai-usage.service.ts).
-- One row per LLM call recorded via llm-router's onCall hook.
create table if not exists ai_usage_records (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  provider text not null,
  operation text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  success boolean not null,
  user_id text not null,
  key_source text not null,
  cost_usd numeric
);

create index if not exists ai_usage_records_created_at_idx on ai_usage_records (created_at);
create index if not exists ai_usage_records_user_id_idx on ai_usage_records (user_id);
