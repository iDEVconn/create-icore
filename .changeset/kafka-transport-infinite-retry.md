---
'@idevconn/create-icore': patch
---

Fixes a real crash: the Kafka transport (`libs/shared/src/transport.ts`) relied on kafkajs's own default of 5 connection retries (~10s of backoff) before its connect promise rejects — unlike every other broker transport (Redis, NATS, MQTT, RabbitMQ), which already override their client's defaults for infinite retry. A Kafka broker that's merely slow to come up on boot (or genuinely down) crashed the gateway/microservice process instead of idling and reconnecting once reachable, caught by the nightly `Scaffold Smoke Matrix`'s `no-upload-kafka-shadcn` combo. Now sets `retry: { retries: Infinity }` on the Kafka client, matching the resilience behavior every other transport already has.
