---
"@idevconn/create-icore": patch
---

`docker-compose.yml`: added named volumes (`icore_postgres_data`, `icore_redis_data`) for the postgres and redis data directories, since neither had a persistent volume and `docker compose down` silently discarded all data. Bound the postgres port to `127.0.0.1:5432:5432` instead of `5432:5432` — local `psql`/tooling on the host keeps working, but the port is no longer reachable from outside the host by default. P1 item #5 from the third-party iCore infrastructure audit.
