---
'@idevconn/create-icore': patch
---

Bump scaffolded projects' `typescript` dependency to `^6.0.3` — every generated tsconfig sets `ignoreDeprecations: "6.0"` (added by the Aug 25 NX migration), which TypeScript 5.9 rejects with `TS5103: Invalid value for '--ignoreDeprecations'`, failing `shared:build` in every pm × provider combo of the nightly scaffold smoke matrix.
