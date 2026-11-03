---
'@idevconn/create-icore': patch
---

Pin `@bull-board/api`, `@bull-board/express` and `@bull-board/ui` to one exact version so generated `jobs=bullmq` projects no longer install two copies of `@bull-board/api` (TS2322 `ExpressAdapter` vs `IServerAdapter`).
