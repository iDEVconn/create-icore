---
'@idevconn/create-icore': minor
---

Auth axis now uses the additive blueprint: the auth microservice app.module is static and imports a generated auth.provider.ts wiring the one chosen XAuthModule.forRoot. The regex removeUnusedAuthStrategies is deleted; unchosen auth libs/deps/tsconfig-paths/controller-tests are pruned via the manifest. Kills the auth orphan-bug classes by construction.
