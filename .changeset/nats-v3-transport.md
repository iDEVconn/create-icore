---
'@idevconn/create-icore': patch
---

Fix --transport=nats on Nest 12: install @nats-io/transport-node (NATS v3) instead of the retired nats package; guard test pins transport drivers against @nestjs/microservices peers.
