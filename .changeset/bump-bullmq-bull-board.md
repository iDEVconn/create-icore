---
"@idevconn/create-icore": minor
---

Bump `bullmq` (^5.81.3 → ^6.2.1) and `@bull-board/api`/`@bull-board/express` (^7.2.1 → ^9.4.0). Checked against usage: no reliance on bullmq's removed repeat/legacy-repeatable APIs, `Queue#client`/`redisVersion`, `Worker#resume()`, debounce, or paused job-state filtering; `ioredis` is already an explicit dependency, not relying on bullmq's bundled one. bull-board's only breaking change (7→8, `dateFormats` shape) isn't used here.
