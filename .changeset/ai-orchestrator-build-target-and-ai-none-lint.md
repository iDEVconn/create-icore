---
'@idevconn/create-icore': patch
---

Fix two scaffold bugs surfaced by the nightly Scaffold Smoke Matrix: `ai-orchestrator` crashed at boot on `ai=llm-router` combos (missing explicit `build` target caused the serve executor to resolve the wrong dist path), and `api:lint` failed `@nx/dependency-checks` on `ai=none` combos (unused `@idevconn/ai-usage` dependency was never pruned from `apps/api/package.json`).
