---
'@idevconn/create-icore': minor
---

Optional BullMQ-based jobs subsystem. CLI gains `--jobs=bullmq|none` (default `none`). When enabled, the scaffold ships `apps/microservices/jobs` (3 worker stubs: email / image-process / cleanup), `libs/jobs-client` (`@icore/jobs-client`) with typed `enqueue<K extends keyof JobsMap>(name, data)`, and a bull-board admin dashboard mounted at `/api/admin/queues`. New `JOBS_REDIS_URL` env, `Dockerfile.ms-jobs`, docker-compose `jobs` service, and CI matrix build entry. Hard-couples to Redis when enabled. **Caveat:** bull-board sits behind raw Express middleware, not Nest's AuthGuard — consumers must front it with reverse-proxy auth before exposing publicly.
