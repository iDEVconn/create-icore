# Cloudflare D1 + R2 providers (phase 1 of `--host=cloudflare`)

Date: 2026-10-20 · Status: draft for approval · Branch: `feature/cloudflare-d1-r2`

## Intent

A real project needs its data and files on Cloudflare, with Supabase used **only for
authentication** (email/password + Google). The full ask is Workers + D1 + R2 +
Supabase Auth, delivered as a native `create-icore` option (`--host=cloudflare`).

Running the API on Workers is a large piece of work (Nest on Workers is unproven, the
Redis session store and TCP microservice transport do not fit the runtime). We are
deliberately deferring it. This phase delivers the part that fits the existing
architecture unchanged: **D1 as a `DBStrategy` and R2 as a `StorageStrategy`**, both
selectable in `create-icore`. The backend keeps running on Node exactly as today.

Result of this phase: `create-icore --auth=supabase --db=d1 --upload=r2` yields a project
where Supabase holds only identities, application data lives in D1, and files live in R2.

## Goals

- `libs/db-strategies/d1`: `DBStrategy` over the D1 REST API, behaviour-identical to the
  sqlite strategy (same document shape, same `QueryOptions` semantics, same errors).
- `libs/storage-strategies/r2`: `StorageStrategy` for R2 through its S3-compatible
  endpoint, with R2-specific env names.
- `create-icore`: `d1` becomes a `DbProvider`, `r2` an `UploadProvider`; wired through
  options, config validation, wizard prompts, manifest, env scaffolding, audit.
- Passes the same contract/unit tests and scaffold-smoke gates as sibling strategies.
- Docs: a runbook covering account/token/bucket setup and the known limits.
- Auth + data separation is verifiable: with `db=d1 upload=r2`, nothing in the generated
  project reads or writes Supabase tables/storage.

## Non-goals (this phase)

- Running `apps/api` or any microservice on Cloudflare Workers.
- Durable Object / KV session store, `local` in-process transport, Hono gateway.
- Jobs on Cloudflare Queues/Cron, payment, AI orchestrator on Workers.
- The `--host=cloudflare` flag itself (it later becomes a preset that sets
  `db=d1`, `upload=r2` plus the Workers pieces).
- Static frontend hosting / Wrangler deploy workflows.
- D1 migrations tooling beyond lazy `CREATE TABLE IF NOT EXISTS`, matching sqlite.

## Anti-goals

- Anything that makes the `d1`/`r2` choice leak into feature code. Notes/upload MS must
  not know which provider they got (the existing strategy-interface rule).
- Silent fallback to a fake in production when credentials are missing.
- Hand-written `project.json` / tsconfig stacks: libs are created with Nx generators
  (repo rule).

## Constraints

- Repo rules in `AGENTS.md` apply: Nx generators for new libs, prettier → lint → build →
  docs, a `.changeset/*.md` (minor), PR against `dev` only, never merge, template drift
  check last, `tools/create-icore/_template-shell` drift test, manifest `appTests` for any
  app test importing a provider lib.
- Node 24; global `fetch` available, so no HTTP client dependency for D1.
- Provider env follows the existing 3-layer env model (selection / credentials).

## Design

### D1 strategy (`@icore/db-d1`)

- Transport: `POST https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query`
  with `Authorization: Bearer <token>`; body `{ sql, params }`. No batch API in phase 1
  (every strategy operation is a single statement).
- The strategy depends on a narrow `D1ClientLike { query(sql, params):
Promise<{ rows; changes }> }`, mirroring the `MinioClientLike` pattern. Phase 1 ships a REST client;
  a Workers-binding client can implement the same interface later with no strategy change.
- Table shape and every method mirror `SqliteDBStrategy`: `id TEXT PRIMARY KEY, data TEXT`
  (JSON), `ensureTable` memoized per collection, identifier validation, `update` via
  `json_patch` and `not_found:` errors when `changes === 0`, `list` with `json_extract`
  filters/ordering/limit.
- Env: `DB_PROVIDER=d1`, `D1_ACCOUNT_ID`, `D1_DATABASE_ID`, `D1_API_TOKEN` (all required).
  Missing → the existing `buildStrategyWithFallback` behaviour (fake in dev, loud failure
  in production).
- Error mapping: HTTP/`success:false` responses become typed errors carrying Cloudflare
  error codes; network failures are not swallowed.
- Known REST caveats to handle/verify against a real database: the docs type `params` as
  strings (numbers/booleans/`LIMIT ?` must be verified or serialized explicitly); no
  documented rate limit; each call is an HTTPS round trip (slower than local SQLite);
  100 bound parameters and 2 MB per row (so `in` lists > ~95 items must be rejected with
  a clear error).

### R2 strategy (`@icore/storage-r2`)

- R2 is S3-compatible (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`,
  presigned GET/PUT/DELETE up to 7 days; presigned URLs do **not** work on custom
  domains). The existing `MinioStorageStrategy` logic (ownership prefix, UUID paths,
  signed URL TTL default 900 s) is reused; the r2 module only builds the S3 client from
  R2 env and supplies the existing `MinioClientLike` adapter.
- Env: `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_BUCKET`.
- Packaging (revised 2026-10-20 after reading the generator): the r2 lib is
  **self-contained** and does not import `@icore/storage-minio`. `cleanupUnusedAxis` deletes
  every unchosen provider's `libDirs`, tsPath aliases and deps, and the audit forbids the
  `minio` SDK when `minio` is not chosen, so an r2 project that depended on the minio lib or
  npm package would break at scaffold time. r2 talks S3 through `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner` (the SDK Cloudflare documents for R2, and one that also runs on
  Workers later). The ~40 lines of ownership-prefix logic are duplicated, as every other
  storage strategy already does.
- Bucket creation: r2 never creates buckets; the bucket must exist (R2 tokens are usually
  object-scoped). A missing bucket surfaces as a clear error on first upload.
- MIME allowlist and ownership behave as in the other storage strategies (in code, not
  bucket policy).

### create-icore wiring

Follow how `sqlite` (db) and `minio` (storage) are wired: `options.ts` types, `config.ts`
allowed values, `prompts.ts` wizard entries, `manifest/index.ts` units (`libDirs`, `deps`,
`tsPaths`, `nestModule`), `scaffold-env.ts` env blocks and deps, `manifest/audit.ts` dep
audit entry, `appTests` for any provider-specific app test. The r2 unit lists both its own
lib only; its deps are the two AWS SDK packages.
Scaffold-smoke gets the combination `auth=supabase db=d1 upload=r2`.

### Cross-cutting rules

- Base: the sqlite strategy and its contract test (`sqlite-db.contract.unit.test.ts`) are
  already merged into `dev` (commit `530614b`), and this branch is cut from that `dev`.
- REST client policy: 10 s timeout via `AbortSignal`; retry only on HTTP 429/503 and
  pre-response network errors, max 2 retries, exponential backoff honouring `Retry-After`;
  never retry other 4xx/5xx.
- Bound-parameter cap: the strategy counts the final params array of each statement and
  throws `too_many_params` (before any request) when it exceeds 100. Not a fixed `in`
  length.
- Param serialization (checked against SQLite 2026-10-20 with `node:sqlite`): `LIMIT ?`
  accepts a numeric string (`'2'` works, `'abc'` is `datatype mismatch`), and
  `CAST(x AS NUMERIC) < ?` works with strings; but `json_extract(...) = ?` and
  `IN (?, ?)` do **not** match numbers or booleans when the param is a string (`n = '3'`
  and `b = '1'` return 0 rows). Rule, independent of how the real D1 REST API types
  params: booleans become `1`/`0`; any `==`, `!=` or `in` whose value is a number or boolean
  compares `CAST(json_extract(...) AS NUMERIC)` with `CAST(? AS NUMERIC)`; text values keep
  a plain `=`. `LIMIT` is validated as an integer and inlined as a literal. All param
  normalisation lives in one function.
- CI guard: the in-memory-SQLite `D1ClientLike` used in contract tests has a mode that
  stringifies every param (simulating the REST worst case); the contract suite runs in both
  modes, so a strategy that only works with typed params fails CI.
- Provider combinations: no new restrictions. `db=d1` / `upload=r2` are independent axes
  like every other provider and combine with any auth/example choice.
- Supabase-separation check: a create-icore test asserts that for `db=d1 upload=r2` the
  generated provider files import `@icore/db-d1` / `@icore/storage-r2`, and the Supabase db
  and storage libs are absent. `wire-ai-usage-db` (the ai-usage `DBStrategy` provider) is
  manifest-driven, so the new `d1` manifest unit makes AI usage rows land in D1 with no code
  change there; the test covers it.

## Testing

- Strategy contract: run the existing DB contract suite against `D1DBStrategy` using an
  in-memory `D1ClientLike` backed by SQLite (so CI needs no Cloudflare account).
- REST client: unit tests with a mocked `fetch` (auth header, body, error mapping,
  param serialization).
- R2: strategy runs the shared storage contract against an in-memory `R2ClientLike`; the
  S3 client wrapper is tested offline (presigning needs no network); module test checks env
  validation.
- create-icore: option/config/prompt/manifest tests for the new values; scaffold-smoke
  combination.
- Optional live check (not in CI): run both against a real D1 database and R2 bucket when
  the user supplies credentials.

## Left to the builder

Package/lib naming details, test
helper layout, wizard wording, docs structure.

## Decisions made by the assistant (not by the requester)

- R2 is a self-contained lib on the AWS SDK v3 (not a wrapper over the minio lib).
- No auto-create of the R2 bucket.
- Reject statements that exceed D1's bound-parameter limit instead of chunking.
- REST retry/timeout policy, explicit param serialization, no combination restrictions,
  and the Supabase-separation test (see Cross-cutting rules).
- `--host=cloudflare` deferred; only `db=d1` / `upload=r2` ship now.
