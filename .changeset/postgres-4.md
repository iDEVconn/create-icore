---
'@idevconn/create-icore': patch
---

Upgrade `postgres` to 4 in the postgres auth and db strategies (ESM-only driver loaded via `require()` on Node 24; `PostgresAuthStrategyOptions.createSql` is a test seam).
