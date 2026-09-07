---
"@idevconn/create-icore": minor
---

Added a MinIO storage provider (`upload: minio` at scaffold time) — a self-hosted, S3-compatible `StorageStrategy` with no mandatory external SaaS dependency, also compatible with Backblaze B2, Cloudflare R2, and Amazon S3 by pointing `MINIO_ENDPOINT` at that provider's endpoint. Bucket creation is lazy (on first upload), matching the "no dashboard step" self-hosted use case. Added a `minio` service to `docker-compose.yml` (idle unless `STORAGE_PROVIDER=minio`) with a persistent volume and admin console bound to `127.0.0.1:9001`. P2 item #9 from the third-party iCore infrastructure audit.
