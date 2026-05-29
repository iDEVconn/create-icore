# Plan 12 — Job Queue via BullMQ + bull-board

**Date:** 2026-05-29
**Status:** Approved design — implementation lives in `docs/superpowers/plans/2026-05-29-plan-12-bullmq.md`.

## Goal

Add a dedicated jobs microservice running BullMQ workers + a typed enqueue client + an admin UI (bull-board) mounted on the gateway. Optional via CLI (`--jobs=bullmq|none`). Hard-couples to Redis when enabled; consumers running `docker compose up` already have Redis ready.

## Why direct-Redis enqueue (not MS-mediated)

BullMQ's design is: `Queue.add()` writes to a Redis stream; `Worker` reads from the same stream. Wrapping `Queue.add` behind a NestJS `@MessagePattern` adds a network hop + a serialization layer for no upside — and breaks BullMQ's own job-ID + idempotency semantics.

So enqueueing is **direct Redis**: any consumer (gateway, any MS, the CLI itself) imports `@icore/jobs-client`, which holds `Queue` instances on a shared `IORedis` connection. The dedicated `apps/microservices/jobs` process is just where the `Worker` instances live.

## Why centralized workers (a dedicated MS)

Workers are long-running event loops. Hosting them in the gateway or in an existing MS conflates concerns:

- Gateway throughput drops when a worker pulls a big payload off the queue.
- Memory spikes leak between request handling and job execution.
- Restarting one worker (failure / hot-fix) shouldn't restart the gateway.

The `jobs` MS isolates worker lifecycle. Scale horizontally by running N copies of the same image.

## Queue registry (typed)

`@icore/shared/jobs.ts` owns the queue catalog so both sides stay in sync:

```ts
export const ICORE_QUEUES = {
  email: 'email',
  imageProcess: 'image-process',
  cleanup: 'cleanup',
} as const;

export type IcoreQueueName = (typeof ICORE_QUEUES)[keyof typeof ICORE_QUEUES];

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
}

export interface ImageProcessJob {
  bucket: string;
  path: string;
  ops: string[];
}

export interface CleanupJob {
  kind: 'expired-magic-links' | 'orphan-uploads';
  olderThanMs: number;
}

export type JobsMap = {
  email: EmailJob;
  'image-process': ImageProcessJob;
  cleanup: CleanupJob;
};
```

`JobsClientService.enqueue<K extends keyof JobsMap>(name: K, data: JobsMap[K], opts?: JobsOptions)` — both sides get type checking.

## Worker stubs

The three default workers ship as **logging stubs**. They unblock consumers (queues exist, enqueue works, admin UI shows traffic) without committing icore to email/image/cleanup business logic. Each stub:

1. Logs the job payload via Nest's `Logger`.
2. Returns successfully.

Consumers replace the body with real logic in their own fork.

## Bull-board admin

`@bull-board/nestjs` mounts the queue dashboard at `GET /api/admin/queues`. The route lives in a new `AdminModule` on the gateway, behind:

- `AuthGuard` (existing global guard already enforces this)
- A new `@CheckAbility('manage', 'all')` decorator usage — admin-only

The mount registers each queue from `ICORE_QUEUES` so users see all three by default.

## Architecture

```
                                  Redis (broker)
                                       ▲ ▼
                  ┌────────────────────┼────────────────────┐
                  │                                          │
        ┌─────────┴───────────┐                  ┌───────────┴────────────┐
        │  any consumer       │                  │  jobs MS               │
        │  (gateway, MS, …)   │                  │                        │
        │                     │                  │  Worker('email')       │
        │  JobsClientService  │  Queue.add ───►  │  Worker('image-…')     │
        │  enqueue('email',…) │                  │  Worker('cleanup')     │
        └─────────────────────┘                  └────────────────────────┘
                  │
                  └── GET /api/admin/queues  (AuthGuard + admin ability)
                      @bull-board/nestjs renders the queue dashboards
```

## Env

| Var                       | Purpose                                | Used by              |
| ------------------------- | -------------------------------------- | -------------------- |
| `JOBS_REDIS_URL`          | shared Redis URL for enqueue + workers | jobs MS, jobs-client |
| `JOBS_WORKER_CONCURRENCY` | per-worker concurrency (default 5)     | jobs MS              |

`JOBS_REDIS_URL` is intentionally separate from `AUTH_REDIS_URL` / `UPLOAD_REDIS_URL` so jobs can live on a dedicated Redis if a consumer wants. In `docker compose` it defaults to the same `redis://redis:6379`.

## CLI integration

New flag `--jobs=bullmq|none`, default `none`. When `bullmq`:

- Scaffolds `apps/microservices/jobs/`, `libs/jobs-client/`, and the gateway `AdminModule`.
- Writes `JOBS_REDIS_URL` to `.env.docker.example` + per-MS `.env.example`.
- Adds a `jobs` service entry to `docker-compose.yml`.

When `none`:

- Removes the three jobs paths.
- Removes `JOBS_REDIS_URL` from env templates.
- Strips the `jobs` service from `docker-compose.yml`.

## Tests

- `jobs-client` — unit tests with `ioredis-mock`: `enqueue` writes to the correct Redis stream + applies `delay`, `attempts`, `removeOnComplete` defaults.
- `jobs` MS — Worker test that spawns a `Queue.add` against a local Redis (via `ioredis-mock`), then a `Worker` consumes it; assert stub handler ran.
- Gateway `AdminModule` — auth path tests: unauthenticated → 401, authenticated non-admin → 403, admin → 200.

## Out of scope

- **Cron / repeating jobs** — BullMQ's `repeat` works but the icore-shipped stubs don't ship cron defaults. Consumers add `Queue.upsertJobScheduler` themselves.
- **Job rate limiting** — BullMQ supports `limiter`; consumer territory.
- **Multi-tenant queue isolation** — consumer adds key prefix via `IORedis` options if needed.
- **Dead-letter-queue handling** — BullMQ retries cover most cases; DLQ is a follow-up plan.
- **Sandboxed processors** (separate Node process per job) — adds container complexity for a sample scaffold.
