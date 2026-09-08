---
'@idevconn/create-icore': minor
---

Add `@idevconn/ai-usage`-backed AI usage tracking: the ai-orchestrator MS records every LLM call through the same `DBStrategy` contract every other feature uses (supabase/firestore/mongodb/postgres, or an in-memory `FakeDBStrategy` when `DB_PROVIDER=none`) — not a Supabase-specific client — via its own `ai-usage-db.provider.ts`, wired independently of the notes demo's db axis so it works even with `example=none`. Exposes `ai.usage.summary`/`ai.usage.timeseries` message patterns; the gateway mounts `AiUsageModule` at `/api/admin/ai-usage/*`, guarded by `@CheckAbility('read', 'AiUsage')` (left ungated when `authProvider=none`, since there's no login at all in that mode). client-shadcn gets an admin-only `/admin/ai-usage` dashboard (stat cards, provider/operation/key-source/user breakdown tables, daily usage table). client-mui/client-antd parity and by-user email enrichment (needs a new `auth.getUser` RPC) are follow-ups, not included here.
