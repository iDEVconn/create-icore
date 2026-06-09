---
'@idevconn/create-icore': minor
---

Phase 2a: each auth strategy template lib (supabase/firebase/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) that owns its construction, required-env, and dev-fake/prod-fail fallback via the new shared `buildStrategyWithFallback`. Additive — strategy classes, contract tests, and the generator are unchanged.
