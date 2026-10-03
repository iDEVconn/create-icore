---
'@idevconn/create-icore': minor
---

New --session=redis|memory option: run login sessions in the gateway process (SESSION_STORE=memory) so small projects need no Redis service; the generated docker-compose drops Redis when nothing else uses it. Default stays redis. Gateway: SESSION_STORE switch, InMemorySessionStore with 30-day expiry, loud warning and a production acknowledgment (SESSION_STORE_ALLOW_MEMORY=true)
