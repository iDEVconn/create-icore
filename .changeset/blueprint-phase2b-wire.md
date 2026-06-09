---
'@idevconn/create-icore': minor
---

Storage axis now uses the additive blueprint: the upload microservice app.module is static and imports a generated storage.provider.ts wiring the one chosen XStorageModule.forRoot. The regex removeUnusedStorageStrategies is deleted; unchosen storage libs/tsconfig-paths/workspace+raw deps are pruned via the manifest (also fixing the previously-orphaned cloudinary/@supabase/supabase-js deps in the upload package.json). Skipped entirely when upload=none.
