# Cloudflare Workers G0 measurement (PR 1 of the Workers phase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a throwaway Worker that hosts a realistic slice of the iCore gateway, deploy it to a real Cloudflare account, and record numbers that decide whether the Nest-on-Workers design (gate G0 of the spec) goes ahead.

**Architecture:** A self-contained harness under `docs/measurements/cloudflare-g0/` (its own `package.json`, installed with `npm`, **not** a Yarn workspace member) compiles the real gateway sources with decorator metadata, bundles them with Wrangler, and exposes probe routes. No file under `apps/` or `libs/` changes. The only product-facing output is a results document and a go/no-go decision.

**Tech Stack:** NestJS 11 + Express on workerd (`nodejs_compat`, `cloudflare:node` `httpServerHandler`), `tsc` for decorator metadata, Wrangler 4, one SQLite-backed Durable Object, one optional D1 binding, Node 24 scripts.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (gate G0 and PR 1 of "Delivery"). Spike evidence: a minimal Nest app already runs on local workerd (see the spec's "Evidence" section).

## Global Constraints

- Branch `feature/cloudflare-g0-measurement` cut from the current head of `feature/cloudflare-workers-spec` (so the spec and this plan land in the same PR as the measurement); PR with `gh pr create --base dev`; never merge; `gh pr list --state all --limit 10` first.
- **No change under `apps/`, `libs/`, `tools/`, root `package.json` or `yarn.lock`.** The harness lives only in `docs/measurements/cloudflare-g0/` and is installed with `npm install` inside that folder (its `node_modules` and build output are gitignored).
- Prettier on every file touched (specific files only, never a whole directory); the changeset is `patch` for `@idevconn/create-icore` with a one-line description (AGENTS.md: every PR needs one).
- The harness imports gateway and microservice sources from the repo via relative paths and the root `tsconfig.base.json` path aliases; it must not copy them.
- Secrets: the Cloudflare API token is read from the environment (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) or a local file the requester names; it is never printed, logged, committed, or put in `wrangler.jsonc`. All script output is scrubbed.
- The deployed Worker, Durable Object and optional D1 database are deleted at the end (Task 5).
- Compatibility date `2026-10-01`, flag `nodejs_compat`.
- G0 pass thresholds (assistant's calls, adjustable by the requester): reported Worker Startup Time ≤ 400 ms (platform hard limit 1 s); slowest of ≥ 5 cold first requests ≤ 2.0 s wall; warm `GET /api/auth/me` CPU p99 ≤ 30 ms; warm Durable Object round trip p95 ≤ 40 ms added wall time; uncompressed bundle ≤ 10 MiB.

## Review Focus

- A build that drops decorator metadata must be caught: the canary route injects a service **without** `@Inject` and the measure script fails if it is `undefined` (Task 1).
- The measured Worker must run the real `AuthGuard` / `CsrfGuard` / throttler / session code, not stubs of them; any substituted piece is named in the results (Task 2).
- Cold-start numbers must come from fresh isolates (a new version per run), not from a warm instance (Task 4).
- No secret appears in logs, results, the committed files or the PR description (Tasks 4-5).
- The results document states the thresholds, every raw number, the colo(s) used, and the decision; a failed threshold is reported as failed, not rounded (Task 5).

---

### Task 1: Harness skeleton and metadata-preserving build

**Files:**

- Create: `docs/measurements/cloudflare-g0/package.json`, `tsconfig.json`, `wrangler.jsonc`, `.gitignore`, `README.md`
- Create: `docs/measurements/cloudflare-g0/src/index.ts`, `src/canary.ts`, `stubs/empty.js`
- Create: `docs/measurements/cloudflare-g0/scripts/build.mjs`

**Interfaces:**

- Produces: `npm run build` (writes `build/` JS with `design:paramtypes` metadata, then lets Wrangler bundle it), `npm run dev` (`wrangler dev --local --port 8787`), routes `GET /g0/health` → `{ ok: true, runtime: 'workerd' }` and `GET /g0/canary` → `{ implicitInjection: true }` (500 and `{ implicitInjection: false }` if the dependency is `undefined`).

- [ ] **Step 1: Write the canary first.** In `src/canary.ts` define `CanaryDep` and `CanaryService` whose constructor takes `CanaryDep` **without** `@Inject`, and a `CanaryController` exposing `GET g0/canary`. Add a Node script test `scripts/check-canary.mjs` that fetches `http://localhost:8787/g0/canary` and exits non-zero unless the body is `{"implicitInjection":true}`.
- [ ] **Step 2: Scaffold the harness.** `package.json` (`"private": true`, scripts above, dependencies `@nestjs/*@^11`, `reflect-metadata`, `rxjs`, `cookie-parser`, `class-validator`, `class-transformer`, `@supabase/supabase-js`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` at the versions in the root `package.json`, dev `wrangler`, `typescript`, `@types/node`); `tsconfig.json` extends `../../../tsconfig.base.json` with `experimentalDecorators`, `emitDecoratorMetadata`, `module ESNext`, `moduleResolution bundler`, `outDir build`, `rootDir ../../..`; `wrangler.jsonc` with `main: "build/docs/measurements/cloudflare-g0/src/index.js"`, the compatibility settings above and an `alias` map sending `kafkajs`, `mqtt`, `nats`, `ioredis`, `amqplib`, `amqp-connection-manager`, `@grpc/grpc-js`, `@grpc/proto-loader`, `@nestjs/platform-socket.io` to `stubs/empty.js`; `.gitignore` with `node_modules`, `build`, `.wrangler`, `dist-dry`, `.dev.vars`.
- [ ] **Step 3: Run the check to see it fail** (`npm install && npm run build && npm run dev` in the background, then `node scripts/check-canary.mjs`): expected FAIL before `src/index.ts` exists.
- [ ] **Step 4: Implement `scripts/build.mjs` and `src/index.ts`.** `build.mjs` runs `tsc -p tsconfig.json` and fails on emit errors only (type errors in unrelated repo files are reported but do not stop the build; list them in the README). `src/index.ts` bootstraps Nest lazily on the first request (memoized promise), mounts `/g0/health` and `/g0/canary`, and exports `{ fetch }` from `httpServerHandler`. Start with the spike's `index.ts` approach, restructured for lazy bootstrap.
- [ ] **Step 5: Run the check to see it pass:** `node scripts/check-canary.mjs` prints `ok`; also confirm `GET /g0/health`.
- [ ] **Step 6: Commit** `docs(g0): harness skeleton with metadata-preserving build`.

### Task 2: Realistic gateway slice with an in-isolate microservice

**Files:**

- Create: `docs/measurements/cloudflare-g0/src/g0.module.ts`, `src/local-transport.ts`, `src/slice-auth-client.module.ts`, `src/bootstrap.ts`
- Modify: `src/index.ts` (use `bootstrap.ts`)

**Interfaces:**

- Consumes: the real `AuthModule`, `SessionModule`, `AuthGuard`, `CsrfGuard`, `ThrottlerModule` setup and `apps/microservices/auth` `AppModule` from the repo (imported by relative path / aliases).
- Produces: `LocalServer(prefix)` and `LocalClientProxy` (the spike's in-process transport, prefix-keyed bus); routes served through the real gateway pipeline: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/logout`, plus `GET /g0/presign` (offline S3 presign) and `GET /g0/supabase` (constructs a `supabase-js` client, no network call), `GET /g0/env` (returns `{ populated: true }` when `process.env.G0_PROBE`, set through a `wrangler.jsonc` var, is visible to Nest's `ConfigService`).

- [ ] **Step 1: Write the failing smoke script** `scripts/check-slice.mjs` (Node `fetch` against the local dev server, cookie jar handling by hand): register → login (expects `Set-Cookie: icore_sid` and the CSRF cookie) → `GET /api/auth/me` returns the user → `POST /api/auth/logout` with `X-CSRF-Token` → `GET /api/auth/me` is 401; `GET /g0/presign` returns a URL containing `X-Amz-Expires`; `GET /g0/supabase` returns `{ client: true }`; `GET /g0/env` returns `{ populated: true }` (verifies `process.env` population and `ConfigModule`, using the compatibility flag `nodejs_compat_populate_process_env` if the date alone does not do it); `POST` without `X-CSRF-Token` is rejected with 403. Run it: FAIL (routes missing).
- [ ] **Step 2: Implement the slice.** `g0.module.ts` is a root module importing only what the gateway needs for the routes above (real `AuthModule`, `ConfigModule.forRoot({ isGlobal: true })` as in `apps/api`'s `AppModule`, `SessionModule` with `SESSION_STORE=memory`, `ThrottlerModule` with the two named throttlers from `apps/api`'s `AppModule`). `slice-auth-client.module.ts` replaces `AuthClientModule.forRoot()` by providing the real `AUTH_CLIENT` token with `LocalClientProxy('AUTH')` and the real `AuthClientService`. `bootstrap.ts` creates the auth microservice app with `NestFactory.createMicroservice(<auth AppModule>, { strategy: new LocalServer('AUTH') })` (provider falls back to the fake auth strategy), then the gateway app configured like `apps/api/src/main.ts` (global prefix `api`, `cookie-parser`), and starts both once. Secrets used by guards (`AUTH_TCP_SECRET`) come from `.dev.vars` locally and `wrangler secret` when deployed.
- [ ] **Step 3: Run the smoke script:** all checks print `ok`. Any needed substitution (anything not the real code) is added to the "Substitutions" list in `README.md`.
- [ ] **Step 4: Measure what is measurable locally:** `npx wrangler deploy --dry-run --outdir dist-dry`, record `Total Upload` and gzip size and the uncompressed bundle size in `README.md`.
- [ ] **Step 5: Commit** `docs(g0): realistic gateway slice on workerd`.

### Task 3: Durable Object and optional D1 probes

**Files:**

- Create: `docs/measurements/cloudflare-g0/src/probe-do.ts`, `src/probes.controller.ts`
- Modify: `wrangler.jsonc` (Durable Object binding `PROBE`, migration `new_sqlite_classes: ["ProbeDurableObject"]`, optional D1 binding `DB`), `src/index.ts` (export the DO class)

**Interfaces:**

- Produces: `ProbeDurableObject` with `fetch` handling `GET /touch` (reads and increments a counter in SQLite storage, returns `{ n }`); routes `GET /g0/do?id=<uid>` (calls the object named by `id`, returns `{ n, doMs }`) and, when the `DB` binding exists, `GET /g0/d1` (runs `SELECT 1` and one insert/select on a probe table, returns `{ ok, d1Ms }`).

- [ ] **Step 1: Failing check.** Extend `check-slice.mjs` (or add `check-probes.mjs`): `GET /g0/do?id=u1` twice returns `n` 1 then 2 and `doMs` numbers; `GET /g0/d1` returns `{ ok: true }` when D1 is bound, otherwise `{ skipped: true }`. Run: FAIL.
- [ ] **Step 2: Implement the probes.** The probe measures `performance.now()` around the DO/D1 call inside the Worker. Locally (Miniflare) the numbers are only a functional check.
- [ ] **Step 3: Run the checks:** pass locally with local DO and local D1.
- [ ] **Step 4: Commit** `docs(g0): durable object and d1 probes`.

### Task 4: Measurement script and results template

**Files:**

- Create: `docs/measurements/cloudflare-g0/scripts/measure.mjs`, `scripts/redact.mjs`, `RESULTS.md` (template with the thresholds and empty tables)

**Interfaces:**

- Produces: `node scripts/measure.mjs --url <https://…workers.dev> --cold-runs 5 --warm-requests 200` which prints a Markdown table and writes `results.json`: for each cold run a fresh version is deployed (`wrangler versions upload` + `versions deploy`, or `wrangler deploy` with a changing `--var G0_RUN:<n>`), then the first request wall time is recorded; for warm runs, `GET /api/auth/me` and `GET /g0/do` wall times (min/p50/p95/p99) plus `cpuTime`/`wallTime` from `wrangler tail --format json` events; the reported `Worker Startup Time` from the deploy output; `cf-ray` colo codes seen. All output passes through `redact.mjs`, which removes the token, account id and any `*.workers.dev` subdomain hash.

- [ ] **Step 1: Write the failing test** `scripts/measure.test.mjs` (`node --test`): `redact.mjs` replaces the token, account id and the account subdomain in a sample string; the percentile helper returns the right p50/p95/p99 for a fixed array; the Markdown renderer marks a value above its threshold as `FAIL`. Run: FAIL.
- [ ] **Step 2: Implement** `redact.mjs`, the percentile and rendering helpers and `measure.mjs` (argument parsing, deploy loop, request loop, tail capture, results rendering against the thresholds in the Global Constraints).
- [ ] **Step 3: Run** `node --test scripts/measure.test.mjs`: PASS. Dry-run `measure.mjs --help` and a run against the local dev server with `--cold-runs 0` to prove the warm-path plumbing works.
- [ ] **Step 4: Commit** `docs(g0): measurement script and results template`.

### Task 5: Live run, results and decision (requires the requester)

**Files:**

- Modify: `docs/measurements/cloudflare-g0/RESULTS.md`

- [ ] **Step 1: Ask the requester for credentials.** Stop and ask for a Cloudflare API token with **Account → Workers Scripts → Edit**, **Account → Workers Tail → Read** and, for the D1 probe, **Account → D1 → Edit**, plus the account id, placed in a local file the requester names (format `Label: value`; read it with a script that scrubs output, never print it). Also confirm the account is on Workers Paid; if it is not, run the Free-plan check (Step 3) and expect the cold request to fail.
- [ ] **Step 2: Deploy and measure.** `wrangler deploy` the harness (secrets via `wrangler secret put`, never printed), then run `measure.mjs --cold-runs 5 --warm-requests 200`; run the optional D1 creation (`wrangler d1 create g0-probe`) first if the requester allows it.
- [ ] **Step 3: Free-plan feasibility.** Record whether a cold request and a warm `GET /api/auth/me` fit the Free plan's 10 ms CPU (read from the tail events); expected: no. Also record the Durable Object requests used by one login → me → logout flow.
- [ ] **Step 4: Fill `RESULTS.md`:** thresholds, raw numbers, colo(s), substitutions, bundle sizes, Free-plan finding, and a **Decision** section: `G0 PASS`, or `G0 FAIL (<threshold>)` with the spec's contingency noted. Do not round a failing value into a pass.
- [ ] **Step 5: Clean up.** `wrangler delete` the Worker, delete the probe D1 database and the Durable Object namespace via the migration/delete route, confirm in the dashboard listing via API that nothing remains, and tell the requester which tokens to revoke.
- [ ] **Step 6: Commit** `docs(g0): live measurement results`.

### Task 6: Docs, changeset, gates and PR

**Files:**

- Modify: `docs/measurements/cloudflare-g0/README.md` (how to run, substitutions, known type-error list); `docs/superpowers/specs/2026-10-20-cloudflare-workers-design.md` (status line with the G0 outcome, one line)
- Create: `.changeset/cloudflare-g0-measurement.md`

- [ ] **Step 1: Changeset** `'@idevconn/create-icore': patch`, one line: documents the Cloudflare Workers G0 measurement.
- [ ] **Step 2: Gates.** `npx prettier --write` on every touched file; `yarn install --immutable` shows no change; `git status` shows nothing under `apps/`, `libs/`, `tools/`, `package.json`, `yarn.lock`; discard any `tools/create-icore/templates/` drift last.
- [ ] **Step 3: Commit** `docs: G0 measurement README, spec status and changeset`; then `gh pr list --state all --limit 10`, push, `gh pr create --base dev`, wait for CI, report the link and the decision. Do not merge.
