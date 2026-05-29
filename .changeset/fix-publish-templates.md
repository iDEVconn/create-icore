---
'@idevconn/create-icore': patch
---

fix: ship complete templates — yarn releases, notes/payment/jobs MSes, Dockerfiles, .gitignore

`prepublishOnly` previously ran only `tsup`, skipping `snapshot-templates`. Published 0.2.x packages
were missing `templates/.yarn/releases/yarn-4.5.0.cjs` (causing ENOENT on `yarn install` in the
generated project), the notes/payment/jobs microservices, Dockerfiles, docker-compose.yml, and
`.gitignore`. Snapshot now runs as the first step in `prepublishOnly` and is converted to plain
`.mjs` so it needs no TypeScript tooling to execute.
