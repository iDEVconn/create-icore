---
'@idevconn/create-icore': minor
---

Phase 2b: each storage strategy template lib (supabase/firebase/cloudinary/mongodb) now ships a self-contained NestJS DynamicModule (`forRoot`) owning its construction, required-env, and dev-fake/prod-fail fallback via the shared buildStrategyWithFallback. Additive — strategy classes, contract tests, and the generator are unchanged.
