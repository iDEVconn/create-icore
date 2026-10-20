# Runbook: Cloudflare D1 (db) and R2 (storage)

This runbook describes how to use Cloudflare D1 as the `DBStrategy` and Cloudflare R2 as the `StorageStrategy` in iCore. Both are reached over HTTPS from the regular Node.js backend: D1 through the Cloudflare REST API, R2 through its S3-compatible endpoint. Design rationale: [`docs/superpowers/specs/2026-10-20-cloudflare-d1-r2-design.md`](../superpowers/specs/2026-10-20-cloudflare-d1-r2-design.md).

## Scope

This phase ships only two providers: `--db=d1` (`@icore/db-d1`) and `--upload=r2` (`@icore/storage-r2`). It is deliberately **not** "everything on Cloudflare" — the gateway and microservices still run on Node.js.

## Prerequisites

- A Cloudflare account (D1 and R2 both have a free tier; R2 requires a payment method on file)
- Node.js 24+
- An iCore project scaffolded with the D1 and/or R2 options

## Scaffolding

```bash
# Supabase holds only identities; app data lives in D1, files in R2
npm init @idevconn/icore my-saas -- --auth=supabase --db=d1 --upload=r2 --ui=shadcn
```

With this combo Supabase is used for auth only. The scaffold test `scaffold-cloudflare.unit.test.ts` covers this separation. `--db=d1` and `--upload=r2` can also be used independently of each other and of any `--auth` value.

## D1 setup

1. In the Cloudflare dashboard go to **Storage & Databases → D1 SQL Database → Create database**. Note the **Database ID** (UUID) and your **Account ID** (dashboard sidebar or URL).
2. Create an API token: **My Profile → API Tokens → Create Token → Custom token**, permission **Account → D1 → Edit**, scoped to your account. Copy the token once — it is not shown again.
3. Set the env vars (for every microservice that uses the db provider, and for `ai-orchestrator` when `ai` is enabled):

```env
DB_PROVIDER=d1
D1_ACCOUNT_ID=<account id>
D1_DATABASE_ID=<database uuid>
D1_API_TOKEN=<token with D1 Edit>
```

The strategy calls `POST https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query`.

### Data model

Each collection is one table: `id TEXT PRIMARY KEY, data TEXT` (the document as JSON). Tables are created lazily on first use of a collection — no migration files.

### Limits and behaviour

- **Latency:** every call is an HTTPS round trip to Cloudflare, noticeably slower than local SQLite.
- **Timeout and retries:** the REST client times out after 10 s. It retries HTTP 429/503 and pre-response network errors, at most 2 times. A timeout is deliberately **not** retried — the write may already have been applied.
- **Bound parameters:** at most 100 per statement; exceeding it throws `too_many_params` (large `in` filters, bulk writes).
- **Row size:** 2 MB per row.
- **Database size:** 10 GB (Workers Paid) / 500 MB (Free).
- **Rate limit:** none documented for the REST API.
- **Numeric/boolean filters:** `==`, `!=` and `in` on numbers and booleans compare via `CAST(... AS NUMERIC)` (booleans are stored and compared as 1/0). A filter `== 0` therefore also matches non-numeric strings, and `== 30` matches a stored `"30"`.

### ai-orchestrator

With `ai` enabled and `db=d1`, AI usage rows (`ai_usage_records`) are also written to D1. The `D1_*` credentials reach `ai-orchestrator` through the **root `.env`** written by the generator (the same route as `POSTGRES_URL` / `MONGODB_URI`). No manual step is needed.

## R2 setup

1. In the dashboard go to **R2 Object Storage → Create bucket**. **Create the bucket yourself** — the strategy never creates buckets. A missing bucket surfaces as `NoSuchBucket` on the first upload.
2. **R2 → Manage R2 API Tokens → Create API token** with **Object Read & Write** on that bucket. Copy the Access Key ID and Secret Access Key.
3. Set the env vars on the upload microservice:

```env
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=<bucket name>
```

The strategy uses the AWS SDK v3 S3 client against `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com` with region `auto`. It does not use or require the `minio` package.

### Behaviour

- **Object keys:** `<userId>/<uuid>-<filename>`; `/`, `\` and control characters in the filename are replaced by `_`. The ownership prefix is checked in code, and `.`/`..` segments are rejected.
- **Signed URLs:** presigned GET URLs work only on the `*.r2.cloudflarestorage.com` domain, not on custom domains. Default TTL 900 s, maximum 7 days (larger values are clamped). An invalid TTL (NaN or <= 0) throws `invalid_ttl`.
- **No MIME allowlist** (same as MinIO).

## Deferred (not in this phase)

See the [spec](../superpowers/specs/2026-10-20-cloudflare-d1-r2-design.md) for details:

- Running the API/microservices on Cloudflare Workers
- Durable Object / KV session store
- `local` in-process transport
- Jobs, payment and AI on Workers
- The `--host=cloudflare` flag itself — it will later be a preset: `host=cloudflare` → `db=d1`, `upload=r2` plus the Workers pieces

## Known limitations / follow-ups

- The prefix check in the gateway `assertOwnership` and in `MinioStorageStrategy` does not reject `.`/`..` segments (the R2 strategy does). Consider hardening all storage providers.
