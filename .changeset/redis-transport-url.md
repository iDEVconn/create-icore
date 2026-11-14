---
'@idevconn/create-icore': patch
---

Fix the Redis microservice transport ignoring its URL: ${PREFIX}_REDIS_URL is resolved to host/port/credentials/db/TLS, so non-default hosts and ports (and docker service names) work.
