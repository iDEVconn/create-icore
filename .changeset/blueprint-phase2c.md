---
'@idevconn/create-icore': minor
---

Phase 2c: each DB strategy template lib (supabase/firestore/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) owning its construction, required-env, and dev-fake/prod-fail fallback via the shared buildStrategyWithFallback. Additive — strategy classes, contract tests, and the generator are unchanged.
