---
'@idevconn/create-icore': minor
---

DB axis now uses the additive blueprint: the notes microservice app.module is static and imports a generated db.provider.ts wiring the one chosen XDbModule.forRoot. The regex removeUnusedDbStrategies is deleted; unchosen db libs/tsconfig-paths/workspace+raw deps are pruned via the manifest. Skipped entirely when example=none (notes MS removed). This completes the provider-axis migration — all of auth/storage/db are now blueprint-driven.
