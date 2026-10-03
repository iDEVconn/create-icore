---
'@idevconn/create-icore': patch
---

pnpm projects boot: generated pnpm-workspace.yaml now sets shamefullyHoist so built microservices find firebase-admin/ioredis/etc. at the root node_modules (they crashed with "Cannot find module" under pnpm's strict isolation); nightly scaffold smoke waits 90 s instead of 25 s so such crashes are no longer false greens
