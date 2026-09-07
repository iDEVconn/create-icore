---
"@idevconn/create-icore": minor
---

Add `apps/microservices/ai-orchestrator`, a new microservice wrapping `@idevconn/llm-router` (provider-agnostic LLM registry + orchestrator/task-router + RAG via `PgVectorStore`) behind the gateway↔MS RPC pattern. New `libs/ai-client` (gateway-side client), `apps/api/src/app/ai` (`POST /api/ai/{generate,orchestrate,rag/query}` + `GET /api/ai/providers`, guarded by `AuthGuard` + a named `ai-burst` throttle), `Dockerfile.ms-ai`, and a `docker-compose.yml` `ai` service. Closes the "no AI Orchestrator" architecture gap flagged by the third-party iCore infrastructure audit. CLI/generator optionality (`ai: 'llm-router' | 'none'`) ships in a follow-up PR — this PR always includes the feature.
