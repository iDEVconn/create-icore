---
'@idevconn/create-icore': patch
---

Projects generated without microservices no longer keep `libs/shared/src/local-transport.ts`, its tests, or its `index.ts` re-export, so they build after `@nestjs/microservices` is removed.
