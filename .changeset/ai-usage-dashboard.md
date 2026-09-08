---
'@idevconn/create-icore': minor
---

Add `@idevconn/ai-usage`-backed AI usage tracking: the ai-orchestrator MS records every LLM call to Supabase (`ai_usage_records`, opt-in — degrades to a startup warning without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) and exposes `ai.usage.summary`/`ai.usage.timeseries` message patterns; the gateway mounts `AiUsageModule` at `/api/admin/ai-usage/*` guarded by `@CheckAbility('read', 'AiUsage')`; client-shadcn gets an admin-only `/admin/ai-usage` dashboard (stat cards, provider/operation/key-source/user breakdown tables, daily usage table). client-mui/client-antd parity and by-user email enrichment (needs a new `auth.getUser` RPC) are follow-ups, not included here.
