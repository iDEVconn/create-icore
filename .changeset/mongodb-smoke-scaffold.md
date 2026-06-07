---
'@idevconn/create-icore': patch
---

Add MongoDB scaffold smoke combos (Layer A typecheck in `pipeline.yml` and Layer B install+boot in `scaffold-smoke-matrix.yml`) and fix the `MongooseModule.forRootAsync` strip regex so non-MongoDB combos no longer emit broken `app.module.ts` (the non-greedy `}),` match stopped at the inner `useFactory` return).
