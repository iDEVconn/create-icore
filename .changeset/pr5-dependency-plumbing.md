---
"@idevconn/create-icore": patch
---

Fix two dependency-wiring gaps: the root package.json's @types/bcrypt + @types/jsonwebtoken pnpm-hoisting workaround now also applies to authProvider=postgres (previously mongodb-only, even though the postgres strategy imports the same two packages); writeProvider() now merges the chosen auth/storage/db provider's own workspace alias + raw deps into the microservice's package.json instead of only ever removing the unchosen providers' entries — previously a fresh postgres (or any non-hardcoded-default) generation had zero declared dependency on its own provider package, working only by yarn's node_modules hoisting and breaking under pnpm/npm's stricter isolation.
