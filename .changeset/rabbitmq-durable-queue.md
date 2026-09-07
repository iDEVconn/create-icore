---
"@idevconn/create-icore": patch
---

RabbitMQ transport now declares queues with `durable: true` instead of `durable: false`, so queued messages survive a broker restart instead of being dropped.
