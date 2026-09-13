---
'@idevconn/create-icore': patch
---

Fix `MongoDbDBStrategy` build failure against mongoose >=9.10.0: `getModel()` now casts the freshly-created `Model` before storing it in the `Map<string, Model<unknown>>` cache, matching the existing cast on the read path. Newer mongoose releases tightened `Model`'s generic variance, making the unqualified assignment a TS2345 error. A fresh `npm`/`pnpm`/`yarn install` in a scaffolded project resolves the `^9.9.5` range to the latest 9.x, so this broke every `db=mongodb` scaffold regardless of package manager.
