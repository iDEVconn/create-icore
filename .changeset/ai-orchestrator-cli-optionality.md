---
"@idevconn/create-icore": minor
---

`ai: 'llm-router' | 'none'` CLI/generator option — the AI orchestrator microservice (added in a prior PR) is now optional and removable exactly like `payment`/`jobs`. `ai=none` (the default) strips `apps/microservices/ai-orchestrator`, `apps/microservices/ai-orchestrator-e2e`, `libs/ai-client`, `apps/api/src/app/ai`, `Dockerfile.ms-ai`, the docker-compose `ai` service, and the corresponding deps/tsconfig-paths/blueprint entries. Verified with real end-to-end scaffolds (`smoke-scaffold.mjs --ai=llm-router`, typecheck-clean) in addition to the fixture-based unit tests. CI's scaffold-smoke matrix and the docker-build matrix now cover the `ai` axis too.
