---
'@idevconn/create-icore': patch
---

Dockerfiles install python3/make/g++ in the builder stage so native addons (better-sqlite3) compile on Alpine.
