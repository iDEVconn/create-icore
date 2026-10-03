---
'@idevconn/create-icore': patch
---

Fix a session-refresh race: a request that lost the refresh race no longer deletes the winner's fresh session, the in-lock auth RPCs (refresh/verify) time out after 8 s and the refresh lock TTL is 30 s so a hung auth MS fails fast with 503 instead of letting the lock expire, and RedisSessionStore.update no longer resurrects a deleted session
