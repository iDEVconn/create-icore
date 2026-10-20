# Runbook: Cloudflare Workers host (`apps/worker`)

Status: **not live-tested on Cloudflare** (the account used for the G0 measurement was deleted). Verified under `wrangler dev --local`
(workerd + Miniflare Durable Objects) by `yarn nx run worker:smoke`, which CI runs. Not reachable through `create-icore` yet (`--host=cloudflare` is PR 6).

## What it is

One Worker that hosts, in a single isolate, the gateway (`apps/api`'s own modules) and the auth, upload and notes microservices
(their own `AppModule`s). The gateway reaches them through the `local` transport (`AUTH_TRANSPORT=local`, …), so `ClientProxy.send` calls
the `@MessagePattern` handlers directly. Nothing that needs a long-lived process is hosted: jobs/bull-board, payment and ai are out.

| Concern     | Node deployment       | Worker                                                           |
| ----------- | --------------------- | ---------------------------------------------------------------- |
| Sessions    | Redis `SessionStore`  | `SESSION_STORE=durable-object` → `DurableObjectSessionStore`     |
| Rate limits | in-memory per process | `DurableObjectThrottlerStorage` (per `<throttler>:<key>` object) |
| D1          | REST API              | `D1_DATABASE_BINDING` from `env.DB` when the Worker has one      |
| Settings    | `.env` files          | wrangler `vars` + secrets (`process.env`); no filesystem         |

## Layout

- `src/index.ts` — entry: lazy, memoized bootstrap on the first request (the memo is cleared on failure; a canceled bootstrap otherwise
  hangs every later request), then `httpServerHandler` from `cloudflare:node`.
- `src/bootstrap.ts` — starts each microservice with `buildTransportMS(prefix)` and `abortOnError: false`, then the gateway.
- `src/hosted-apps.ts` — the only place that imports other apps' modules (the set of hosted features).
- `src/gateway.module.ts`, `src/bindings.module.ts` — gateway composition and the global providers made from `env`.
- `src/durable-objects.ts` — `SessionDurableObject` / `ThrottleDurableObject`, thin shells over `SessionObjectCore` / `ThrottleObjectCore` (`@icore/shared`).
- `scripts/build.mjs` — `tsc` first (Wrangler's esbuild does not emit `emitDecoratorMetadata`, and iCore relies on implicit constructor
  injection: without it dependencies are silently `undefined`), then writes `tsconfig.bundle.json` mapping `@icore/*` to the compiled JS.
- `wrangler.jsonc` — bindings, `nodejs_compat`, and `alias` stubs for Nest's optional transports.

## Commands

```
yarn nx run worker:build    # tsc + wrangler deploy --dry-run (bundle check, no account needed)
yarn nx run worker:smoke    # wrangler dev --local, register/login/notes/logout + rate-limit checks
yarn nx run worker:serve    # wrangler dev --local on :8787
```

## Platform facts that shaped the code (G0, see `docs/measurements/cloudflare-g0/RESULTS.md`)

- `process.env.NODE_ENV` is forced to `production` on a deployed Worker, so the dev fakes are never used there: a real deployment needs real
  Supabase/D1/R2 settings. `serve`/`smoke` replace it at bundle time (`--define`) to run with the fakes.
- State in an isolate's memory is not shared between isolates — the reason sessions and throttle counters live in Durable Objects.
- Each Durable Object / D1 round trip is ~70–80 ms from a distant colo; every authenticated request is one Durable Object request.
- Workers Paid is required in practice (cold bootstrap uses ~70 ms CPU; the Free plan allows 10 ms).

## Not done yet

- Real deployment, Smart Placement and region hints, `--host=cloudflare` in `create-icore` (PR 6), SPA assets binding, R2/D1 bindings
  wired into the notes/upload microservices by the generator (the repo's own notes microservice still selects Supabase).
