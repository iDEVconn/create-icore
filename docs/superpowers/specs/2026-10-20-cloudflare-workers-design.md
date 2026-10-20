# Cloudflare Workers hosting (phase 2 of `--host=cloudflare`)

Date: 2026-10-20 · Status: draft for approval · Branch: `feature/cloudflare-workers-spec`
Builds on: `2026-10-20-cloudflare-d1-r2-design.md` (phase 1, merged in PR #357).

## Intent

The client asked for **Cloudflare Workers + D1 + R2, Supabase only for authentication, as a native
`create-icore --host=cloudflare` option**. Phase 1 put the data (D1) and the files (R2) on
Cloudflare but the API still runs on Node. This phase moves the API itself onto a Worker so the
whole product, SPA included, is hosted on Cloudflare with no VPS.

Written without a requirements interview (the requester opted out of questions); every call the
requester has not made is listed under "Decisions made by the assistant".

## What "done" looks like (assistant's guess, to be corrected)

```
npx create-icore my-app --host=cloudflare --auth=supabase --db=d1 --upload=r2
cd my-app && yarn nx run worker:deploy        # one command, one URL
```

Open the URL: the SPA loads, a user signs up and logs in through Supabase (email/password and
Google), creates and edits notes (rows in D1), uploads and downloads a file (object in R2),
logs out, and an admin revoking that user's sessions takes effect immediately. `wrangler dev`
runs the same app locally with local D1, R2 and Durable Objects and no external service.

## Evidence this is feasible (spike, 2026-10-20, local workerd)

Works: Nest 11 + `@nestjs/platform-express` via `httpServerHandler` from `cloudflare:node`,
DI, `cookie-parser`, JSON bodies, `AsyncLocalStorage`, `node:crypto`, and a custom in-process
`Server` + `ClientProxy` pair delivering `@MessagePattern` and `RpcException`. A minimal app
bundles to 4.1 MiB / 762 KiB gzip. Two traps found: (1) Wrangler's esbuild does not emit
`emitDecoratorMetadata`, so constructor injection without `@Inject` silently injects
`undefined` (iCore relies on implicit injection almost everywhere); a `tsc`-compiled build
fixes it. (2) Nest's optional requires (`kafkajs`, `mqtt`, `nats`, `ioredis`, `amqplib`,
`amqp-connection-manager`, `@grpc/*`, `@nestjs/platform-socket.io`) break bundling unless
aliased to a stub. **Not yet measured:** real startup time and CPU on a deployed Worker, and
the bundle size of the full iCore API.

## Goals

- `apps/worker`: one Worker that hosts the gateway HTTP app **and** the microservice apps
  (auth, upload, notes) in the same isolate, reusing the existing Nest modules, controllers,
  guards and strategies unchanged.
- A `local` transport (`X_TRANSPORT=local`) so gateway ↔ microservice calls stay the same
  `ClientProxy.send/emit` + `@MessagePattern` code, delivered in-process.
- A Durable Object `SessionStore` that passes the existing `runSessionStoreContract`, keeping
  the BFF cookie session, CSRF and refresh-lock invariants of `docs/runbooks/bff-session-auth-migration.md`.
- D1 through a **binding** (typed params, no REST rate limit, no HTTPS round trip), reusing the
  `D1ClientLike` seam from phase 1.
- The SPA served from the same Worker (static assets), so `/api` is same-origin.
- `create-icore --host=cloudflare` (wizard, flag, config file, validation) that generates the
  worker app, `wrangler.jsonc`, a deploy workflow and removes Node-only artifacts.
- Local development with `wrangler dev` using local D1, R2 and Durable Objects.

## Non-goals (this phase)

- Jobs (BullMQ + bull-board) → Cloudflare Queues / Cron, payment, and the AI orchestrator on
  Workers. `--host=cloudflare` forces `jobs=none payment=none ai=none` for now and says why.
- `auth=firebase|mongodb|postgres` and `db` other than `d1` with `--host=cloudflare`
  (`firebase-admin`, `mongoose`, `postgres` need Node sockets or Node-only APIs). Supabase auth
  and `auth=none` are supported.
- Swagger UI on Workers (it serves assets from disk).
- Multi-region data placement, custom domains, WAF/CDN tuning.
- Migrating existing Node deployments to Workers (this is a new generator option).
- Cloudflare Containers (the requester prefers Workers).

## Anti-goals

- Forking the application code: a feature must not know whether it runs on Node or on a Worker.
  No `if (isWorker)` in controllers, services or strategies; the host differs only in the
  entrypoint, the transport, the session store and the bindings.
- Silent DI failure: a build that drops decorator metadata must fail CI, not inject `undefined`.
- Weakening auth: no session store that is only eventually consistent, no unauthenticated
  fallback, no change to `AuthGuard` / `CsrfGuard` semantics.
- A hand-written Nx project: new projects come from Nx generators (repo rule).

## Constraints

- Repo rules of `AGENTS.md` apply (PR to `dev`, changeset, prettier/lint/build/docs, CI
  pipelines come in pairs: any `VITE_*` or API env change goes into **both**
  `.github/workflows/pipeline.yml` and `manual-deploy.yml`, Node-24 action pins, template
  dotfiles as underscores, `tools/create-icore/templates/` drift discarded last).
- Workers runtime: no inbound TCP, ~128 MB memory per isolate, 1 s global-scope startup limit,
  `nodejs_compat` with a compatibility date of 2026-10-01 or later.
- Nothing in the worker bundle may import a Node-only transport driver or `fs` at runtime.
- Secrets (Supabase keys, R2 keys, `AUTH_TCP_SECRET`, session secrets) only through
  `wrangler secret`, never in `wrangler.jsonc`.
- Workers Paid plan is assumed (the Free plan's 10 ms CPU limit cannot run Nest); to be
  confirmed by gate G0.

## Design

### Topology

```
Browser ──HTTPS──▶ Worker (apps/worker)
                     ├─ static assets (SPA, SPA fallback)         ASSETS binding
                     ├─ /api/*  → gateway Nest app (Express)       httpServerHandler
                     │              └─ ClientProxy (local) ─┐
                     ├─ auth MS app   ◀── LocalServer('AUTH') ─┤   in-process bus
                     ├─ upload MS app ◀── LocalServer('UPLOAD')┤
                     └─ notes MS app  ◀── LocalServer('NOTES') ┘
   bindings:  DB (D1) · FILES (R2, optional) · SESSIONS (Durable Object) · THROTTLE (Durable Object)
   secrets:   SUPABASE_*, R2_*, AUTH_TCP_SECRET, …
```

Each microservice stays its own Nest application created with `NestFactory.createMicroservice`
and its own `AppModule` (own `ConfigModule`, own `APP_GUARD`), so global guards such as
`HmacAuthGuard` never leak onto gateway routes. Only the transport differs.

### Entry point and lifecycle

`apps/worker/src/index.ts` exports `{ fetch }`. Bootstrapping (all Nest apps) runs lazily on the
first request and is memoized in a module-level promise, so global scope does no heavy work and
stays inside the 1 s startup limit. `fetch` awaits the promise then delegates to the
`httpServerHandler` of the gateway app. Bindings are read through `import { env } from
'cloudflare:workers'`, exposed to Nest providers via small factory providers (`D1_DB`,
`SESSIONS_NAMESPACE`, …).

### `local` transport (`libs/shared`)

- `LocalServer(prefix)` (a `Server` + `CustomTransportStrategy`) registers itself on a bus keyed
  by prefix (`AUTH`, `UPLOAD`, `NOTES`).
- `LocalClientProxy` (a `ClientProxy`) looks the server up on the bus and invokes the handler;
  `send` returns the handler's observable, errors (`RpcException`) arrive as errors, `emit`
  dispatches events.
- `buildTransport(prefix)` returns `{ customClass: LocalClientProxy, options: { prefix } }` and
  `buildTransportMS(prefix)` returns `{ strategy: new LocalServer(prefix) }` when
  `${prefix}_TRANSPORT=local`. `MsTransport` gains `'local'`, valid only with `host=cloudflare`.
- The HMAC signing/verification stays as is (the secret is a Worker secret): zero code change,
  and the same guard code path is exercised.

### Build

The worker is built so that decorator metadata is preserved: TypeScript sources of `apps/*` and
`libs/*` are compiled with `emitDecoratorMetadata` (via `tsc` or SWC) and then bundled by
Wrangler's esbuild with `alias` stubs for the optional Node transports and drivers. A canary
test boots a tiny module with an **implicit** constructor injection in the _built_ bundle and
fails if it receives `undefined`. Swagger, bull-board and `ioredis` are not imported by the worker.

### Sessions (Durable Object)

`DurableObjectSessionStore implements SessionStore` backed by a SQLite-backed Durable Object class
`SessionDurableObject`. One object per user (keyed by `uid`) holds that user's sessions, so
`deleteAllForUser` is one atomic operation and `delete` / `update` are single-threaded.
`sessionId = base64url(uid) + '.' + 256-bit random`; the object verifies the random part.
`get/update/delete` route by the uid prefix. `delete` and `deleteAllForUser` return the records as
they were at deletion (the GETDEL invariant). `update` resolves `false` when the session is gone
(`SET … XX` invariant). `withRefreshLock` is a lease stored in the object with a 30 s TTL and
bounded polling, matching the Redis semantics. Expiry uses a Durable Object alarm. The class must pass
`runSessionStoreContract` and the refresh-race tests that exist for the Redis store.

### Rate limiting

`ThrottlerStorage` implemented on a Durable Object keyed by throttle key, so `auth-burst`
limits hold across isolates. Without it the default in-memory storage would be per-isolate and
effectively off.

### Data and files

- D1 via `createD1BindingClient(db: D1Database): D1ClientLike` (new, in `libs/db-strategies/d1`):
  `db.prepare(sql).bind(...params).all()`, `changes` from `meta.changes`. `D1DbModule.forRoot`
  picks the binding when `D1_BINDING` (default `DB`) is present in `env`, otherwise REST. Tables are
  still created lazily; schema/migration tooling is out of scope.
- R2 keeps the AWS-SDK S3 client with R2 keys as secrets (presigned URLs need them regardless).
  A binding-based client for `put/delete/list` is an optional later optimisation.
- Supabase auth strategy is used unchanged (`supabase-js` talks `fetch`).

### Frontend

The generated client is built to a directory served through the Workers `assets` binding with
`not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*"]`. `/api` is
same-origin, so CORS is moot and the `icore_sid` cookie stays first-party.

### Configuration

`ConfigModule.forRoot` keeps reading `process.env`. The compatibility flag
`nodejs_compat_populate_process_env` (or an equivalent shim) must populate it from
`wrangler.jsonc` vars and secrets; `envFilePath` entries that do not exist are harmless. Local
development uses `.dev.vars`.

### create-icore

New axis `host: 'node' | 'cloudflare'` (default `node`): flag `--host`, wizard question,
config-file key, manifest unit `host.cloudflare` (the worker app, session/throttle Durable
Object libs, `wrangler.jsonc`, deploy workflow, `.dev.vars.example`). Validation rejects
unsupported combinations with a message that links the "Non-goals" list. For
`host=cloudflare`: `transport=local`, `session=durable-object`, `db=d1`, `upload=r2|none`,
`auth=supabase|none`, `jobs/payment/ai=none`. Node-only artifacts (Dockerfiles, compose
services, Redis) are removed. The generated deploy workflow runs `wrangler deploy` with
`CLOUDFLARE_API_TOKEN`.

## Gates and risks

- **G0, measure before building the rest.** Deploy the spike plus a realistic slice of the
  gateway (auth module, AuthGuard, CSRF, throttler, Supabase client) to a Workers Paid
  account and record: cold start, startup-limit headroom, CPU per request (p50/p99), bundle
  size. Proceed only if startup stays well under 1 s and a cold request is acceptable.
  Contingency if G0 fails: replace the Nest gateway with a thin Hono gateway that calls the
  same strategies (a separate, much larger spec) — not part of this one.
- Durable Object ids/latency: every authenticated request does one DO call; measure the added
  latency in G0 and consider a short per-isolate read cache only if it is safe with revocation.
- The AWS SDK and `supabase-js` bundling on workerd (expected fine, verify in G0).
- Workers Paid plan and Durable Object pricing are a client-side cost to state in the runbook.
- `process.env` population and `ConfigModule` behaviour on workerd (verify in G0).

## Testing

- `libs/shared`: local transport contract (send, emit, `RpcException`, missing handler, timeout).
- Durable Objects and D1 binding tested with `@cloudflare/vitest-pool-workers` (real DO and D1
  semantics under Miniflare): `runSessionStoreContract`, refresh-race tests, throttler storage,
  D1 contract in typed-param mode.
- Canary test for decorator metadata in the built bundle.
- Worker smoke in CI: `wrangler dev --local`, then `/api/health`, signup/login against the fake
  auth, notes CRUD, upload, logout, admin revoke.
- create-icore: option/validation/manifest tests, scaffold integration test for
  `host=cloudflare` (generated files present, Node-only artifacts absent, audit clean), new
  smoke combo in both smoke workflows.
- A live check (like phase 1) against a real account before the PR is marked ready.

## Left to the builder

Project and package names (`apps/worker`, DO libs), exact build tool (`tsc` vs SWC), how
bindings are exposed to providers, DO class layout details, wizard wording, docs structure,
whether the per-milestone work is split into several PRs.

## Decisions made by the assistant (not by the requester)

- Same-isolate microservice apps joined by a `local` transport, rather than service-bound
  separate Workers or a rewritten Hono gateway.
- `host` is a new axis; `host=cloudflare` pins transport, session, db and disables jobs,
  payment and AI for this phase.
- Durable Object keyed by user, session id carries the (non-secret) uid.
- Throttling on Durable Objects rather than the Rate Limiting binding.
- SPA served by the same Worker; Swagger off on Workers.
- D1 binding preferred over REST on Workers; R2 stays on the S3 client in v1.
- Workers Paid plan assumed; gate G0 decides, with a Hono-gateway contingency.
- Several PRs are expected (G0 measurement, worker + local transport, sessions/throttling,
  create-icore option), not one.
