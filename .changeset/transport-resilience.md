---
'@idevconn/create-icore': patch
---

Generated projects survive a redis/nats microservice transport whose broker isn't up — only `tcp` was self-contained before.

- **NATS dependency:** scaffold now adds the `nats` driver to the root `package.json` when the NATS transport is chosen. It's an optional peer dep of `@nestjs/microservices`, so without it a nats-transport project crashed on boot with "the nats package is missing".
- **No crash on a down broker:** microservice bootstraps now go through a shared `bootstrapMicroservice()` helper. NestJS rejects `app.listen()` on the _initial_ broker connect failure (the ioredis/nats retry only covers reconnect-after-connect), which previously `process.exit(1)`'d the service. The helper instead logs a boxed banner and retries `listen()` until the broker appears (dev), while keeping fail-fast `exit(1)` for `tcp` and `NODE_ENV=production`.
- **Reconnect after drop:** the redis transport now sets `retryAttempts`/`retryDelay` and nats sets `reconnect`/`maxReconnectAttempts: -1`, so a broker that drops mid-run is re-attached instead of giving up.
