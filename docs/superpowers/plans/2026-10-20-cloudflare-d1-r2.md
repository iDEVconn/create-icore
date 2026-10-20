# Cloudflare D1 + R2 providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare D1 (`DBStrategy`) and R2 (`StorageStrategy`) as selectable providers in the repo and in `create-icore` (`--db=d1`, `--upload=r2`), with Supabase used only for auth.

**Architecture:** Two new self-contained Nx libs mirror their siblings (`sqlite`, `minio`): each exposes a strategy over a narrow client interface (`D1ClientLike`, `R2ClientLike`), a Nest `DynamicModule.forRoot(envPath)` built with `buildStrategyWithFallback`, and is registered as a manifest unit so the existing generator machinery (wiring, cleanup, audit) handles it. Backend keeps running on Node; D1 is reached over its REST API.

**Tech Stack:** TypeScript, NestJS 11, Nx 23 (Yarn 4), Vitest 5, global `fetch` (Node 24), `node:sqlite` (test fake only), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.

**Spec:** `docs/superpowers/specs/2026-10-20-cloudflare-d1-r2-design.md`

## Global Constraints

- Work on branch `feature/cloudflare-d1-r2` (cut from `dev`); the PR targets `dev` only (`gh pr create --base dev`); run `gh pr list --state all --limit 10` before pushing; never merge.
- New libs are created with an Nx generator (`yarn nx g @nx/js:lib …`; run `--help` first, never guess flags), then aligned to the sibling lib's `package.json` / `vitest.config.mts` / `project.json` conventions. No hand-written project scaffolding.
- Lib package names `@icore/db-d1` and `@icore/storage-r2`; Nx project names `db-d1` and `storage-r2`; paths `libs/db-strategies/d1` and `libs/storage-strategies/r2`; both `"type": "commonjs"`, deps `@icore/shared`, `@nestjs/common`, `@nestjs/config`, `tslib`.
- Env: D1 → `DB_PROVIDER=d1`, `D1_ACCOUNT_ID`, `D1_DATABASE_ID`, `D1_API_TOKEN`; R2 → `STORAGE_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- D1 limits: max 100 bound params per statement (throw `too_many_params` before any request); REST client timeout 10 s; retry only on HTTP 429/503 and pre-response network errors, max 2 retries, exponential backoff honouring `Retry-After`.
- R2: region `auto`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, presigned URL TTL default 900 s, clamped to 604800 s; never creates buckets; ownership prefix `<userId>/`.
- Numeric/boolean comparisons in D1 use `CAST(... AS NUMERIC)` on both sides; booleans become `1`/`0`; `LIMIT` is a validated integer inlined as a literal.
- `r2` must not depend on `@icore/storage-minio` or the `minio` npm package; `d1` has no raw SDK dependency.
- Tests are `*.unit.test.ts` in `__tests__/`, Vitest, behaviour not implementation.
- Every package.json dependency change → `yarn install` and commit `yarn.lock` (CI installs with `--immutable`).
- Before each commit: `npx prettier --write <touched files>`; before finishing a task that touches code: `yarn nx lint <project>` and `yarn nx build <project>` green. Commit messages end with the attribution trailer from the session's system reminder.
- Template drift check (`tools/create-icore/templates/`) is the LAST step before the final `git add`.

## Review Focus

- D1 `list` with `where: [{ field, op: '==', value: true }]` / numeric `in` must match stored JSON booleans/numbers even when every param reaches D1 as a string (covered in Task 2).
- `in` with more than ~95 values must throw `too_many_params`, never send a request (Task 2).
- D1 API returns `success: false` / HTTP 4xx on a bad token: error must carry Cloudflare codes and must not retry (Task 1).
- Network timeout / abort must surface as an error, not hang (Task 1).
- R2 `list` must return all keys when more than 1000 objects exist (pagination) (Task 4).
- R2 presign TTL above 7 days must be clamped, not produce an invalid URL (Task 4).
- `create-icore --db=d1 --upload=r2` project must contain no Supabase db/storage libs or SDK and no `minio` dep (Task 6).

---

### Task 1: D1 lib scaffold + REST client

**Files:**

- Create (via generator): `libs/db-strategies/d1/` (project `db-d1`, alias `@icore/db-d1`)
- Create: `libs/db-strategies/d1/src/lib/d1-client.ts`
- Create: `libs/db-strategies/d1/src/index.ts`
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-rest-client.unit.test.ts`
- Modify: root `package.json` (none expected), `tsconfig.base.json` (alias added by generator)

**Interfaces:**

- Produces (all exported from `d1-client.ts`):
  - `type D1Param = string | number | null`
  - `interface D1QueryResult<T> { rows: T[]; changes: number }`
  - `interface D1ClientLike { query<T = Record<string, unknown>>(sql: string, params?: D1Param[]): Promise<D1QueryResult<T>> }`
  - `class D1ApiError extends Error { status: number; codes: number[] }`
  - `interface D1RestClientOptions { accountId: string; databaseId: string; apiToken: string; fetch?: typeof fetch; timeoutMs?: number; maxRetries?: number; sleep?: (ms: number) => Promise<void> }`
  - `function createD1RestClient(opts: D1RestClientOptions): D1ClientLike`

- [ ] **Step 1: Generate the lib.** Run `yarn nx g @nx/js:lib --help`, then generate `d1` under `libs/db-strategies` with importPath `@icore/db-d1`, tsc build, Vitest. Align `package.json`, `vitest.config.mts`, `project.json`, tsconfigs to `libs/db-strategies/sqlite` (name `@icore/db-d1`, Vitest `name: 'db-d1'`, cacheDir/coverage paths for `d1`). Verify: `yarn nx show project db-d1` lists `build`, `lint`, `test`.
- [ ] **Step 2: Write failing tests** in `d1-rest-client.unit.test.ts` with an injected fake `fetch`: `posts sql and params to the account/database query URL with a Bearer token`; `returns rows and changes from result[0].results and result[0].meta.changes`; `throws D1ApiError with status and Cloudflare error codes on success:false`; `does not retry a 401/403/400`; `retries 429 then succeeds, honouring Retry-After (sleep called with 1000 for Retry-After: 1)`; `gives up after maxRetries and throws D1ApiError`; `retries a pre-response network error then succeeds`; `aborts and throws when the request exceeds timeoutMs`.
- [ ] **Step 3: Run** `yarn nx test db-d1` — expect FAIL (module missing).
- [ ] **Step 4: Implement** `createD1RestClient` and `D1ApiError` in `d1-client.ts` per the Interfaces and Global Constraints (URL `https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query`, body `{ sql, params }`, `AbortSignal.timeout(timeoutMs)` default 10000, `maxRetries` default 2, default `sleep` via `setTimeout`). Export from `src/index.ts`.
- [ ] **Step 5: Run** `yarn nx test db-d1` — expect PASS.
- [ ] **Step 6: Commit** `feat(db-d1): D1 REST client` (lib scaffold + client + tests + `tsconfig.base.json` + `yarn.lock` if changed).

### Task 2: `D1DBStrategy` + sqlite-backed test client + contract

**Files:**

- Create: `libs/db-strategies/d1/src/lib/d1-db.strategy.ts`
- Create: `libs/db-strategies/d1/src/lib/testing/sqlite-d1-client.ts` (NOT exported from `index.ts`)
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-db.contract.unit.test.ts`, `d1-db.strategy.unit.test.ts`
- Modify: `libs/db-strategies/d1/src/index.ts`

**Interfaces:**

- Consumes: `D1ClientLike`, `D1Param` (Task 1); `DBStrategy`, `DBDocument`, `QueryOptions` from `@icore/shared`.
- Produces: `const D1_MAX_BOUND_PARAMS = 100`; `class D1DBStrategy implements DBStrategy { constructor(client: D1ClientLike) }`; `function createSqliteD1Client(opts?: { stringifyParams?: boolean }): D1ClientLike` (in-memory `node:sqlite`; when `stringifyParams` is true every non-null param is passed as `String(p)`; SELECTs return `rows`, writes return `changes`).

- [ ] **Step 1: Write failing contract test**: `runDBContract('D1DBStrategy (typed params)', () => new D1DBStrategy(createSqliteD1Client()))` and the same with `{ stringifyParams: true }` (name `'D1DBStrategy (stringified params)'`), importing `runDBContract` from `@icore/shared/testing`.
- [ ] **Step 2: Write failing behaviour tests** in `d1-db.strategy.unit.test.ts` (use the typed and stringified clients): `where == true matches stored boolean`; `where == 30 matches stored number`; `where != 30 excludes stored number`; `where in [1,2] matches numbers`; `where in [ 'a','b' ] matches text`; `list with 101 in-values rejects with too_many_params and issues no query` (spy client); `update on a missing id rejects with not_found: users/nope`; `delete on a missing id rejects with not_found`; `rejects an invalid collection name`; `rejects an invalid where field name`; `limit is inlined as a validated integer (limit -1 or 1.5 rejects)`.
- [ ] **Step 3: Run** `yarn nx test db-d1` — FAIL.
- [ ] **Step 4: Implement `D1DBStrategy`** in `d1-db.strategy.ts`, mirroring `libs/db-strategies/sqlite/src/lib/sqlite-db.strategy.ts` method for method (same table shape `id TEXT PRIMARY KEY, data TEXT NOT NULL`, memoized `ensureTable` issuing the CREATE TABLE and CREATE INDEX as two `query` calls, `json_patch` update, `not_found:` errors from `changes === 0`, identifier validation). Differences: all calls are async through `D1ClientLike`; one private function normalises a `WhereClause` into SQL + params per the Global Constraints (numeric/boolean `==`/`!=`/`in` → `CAST(json_extract(...) AS NUMERIC)` vs `CAST(? AS NUMERIC)`; text keeps plain `=`; `<`/`<=`/`>`/`>=` keep the sqlite strategy's CAST form); a guard throws `Error('too_many_params: …')` when the final params exceed `D1_MAX_BOUND_PARAMS`. Implement `createSqliteD1Client` with `node:sqlite` `DatabaseSync(':memory:')`.
- [ ] **Step 5: Run** `yarn nx test db-d1` — PASS (both contract modes). Export `D1DBStrategy`, `D1_MAX_BOUND_PARAMS` from `src/index.ts`.
- [ ] **Step 6: Commit** `feat(db-d1): D1DBStrategy with sqlite-backed contract tests`.

### Task 3: `D1DbModule`

**Files:**

- Create: `libs/db-strategies/d1/src/lib/d1-db.module.ts`
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-db.module.unit.test.ts`
- Modify: `libs/db-strategies/d1/src/index.ts`

**Interfaces:**

- Consumes: `createD1RestClient`, `D1DBStrategy`; `buildStrategyWithFallback`, `FakeDBStrategy` from `@icore/shared`.
- Produces: `const D1_DB_REQUIRED_ENV: string[]` = `['D1_ACCOUNT_ID','D1_DATABASE_ID','D1_API_TOKEN']`; `class D1DbModule { static forRoot(envPath: string): DynamicModule }` providing/exporting token `'DBStrategy'`.

- [ ] **Step 1: Write failing tests** modelled on `libs/storage-strategies/minio/src/lib/__tests__/minio-storage.module.unit.test.ts` (stub `ConfigService` module): `declares its required env`; `provides a real D1DBStrategy when env present`; `falls back to FakeDBStrategy when env is missing outside production` (assert instance is `FakeDBStrategy`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the module following `sqlite-db.module.ts` (service label `'notes MS'`, provider `'d1'`). **Step 4: Run** — PASS. Export from `index.ts`.
- [ ] **Step 5: Quality gate**: `npx prettier --write libs/db-strategies/d1`, `yarn nx lint db-d1`, `yarn nx build db-d1`. **Step 6: Commit** `feat(db-d1): D1DbModule`.

### Task 4: R2 lib (strategy, S3 client, mock, module)

**Files:**

- Create (via generator): `libs/storage-strategies/r2/` (project `storage-r2`, alias `@icore/storage-r2`)
- Create: `src/lib/r2-storage.strategy.ts`, `src/lib/r2-s3-client.ts`, `src/lib/testing/mock-r2.ts`, `src/lib/r2-storage.module.ts`, `src/index.ts`
- Test: `src/lib/__tests__/r2-storage.contract.unit.test.ts`, `r2-s3-client.unit.test.ts`, `r2-storage.module.unit.test.ts`
- Modify: root `package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` at the same version), `yarn.lock`

**Interfaces:**

- Produces:
  - `interface R2ClientLike { putObject(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>; deleteObject(bucket: string, key: string): Promise<void>; presignGetObject(bucket: string, key: string, expiresInSec: number): Promise<string>; listKeys(bucket: string, prefix: string): Promise<string[]> }`
  - `class R2StorageStrategy implements StorageStrategy { constructor(opts: { client: R2ClientLike; bucket: string }) }` (paths `<userId>/<uuid>-<filename>`, foreign-user `remove`/`getSignedUrl` throw `forbidden`, default TTL 900, clamp 604800)
  - `function createR2S3Client(opts: { accountId: string; accessKeyId: string; secretAccessKey: string }): R2ClientLike`
  - `function createMockR2(): R2ClientLike` (in-memory, exported from `index.ts` like `createMockMinio`)
  - `const R2_STORAGE_REQUIRED_ENV: string[]` = `['R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET']`; `class R2StorageModule { static forRoot(envPath: string): DynamicModule }` providing `'StorageStrategy'`.

- [ ] **Step 1: Generate the lib** as in Task 1 Step 1 (aligned to `libs/storage-strategies/minio`; deps `@icore/shared`, `@nestjs/common`, `@nestjs/config`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `tslib`). Add the two AWS packages to the root `package.json`, run `yarn install`.
- [ ] **Step 2: Write failing tests**: contract `runStorageContract('R2StorageStrategy', () => new R2StorageStrategy({ client: createMockR2(), bucket: 'icore-uploads' }))`; extra strategy tests `getSignedUrl clamps ttl above 604800`, `getSignedUrl default ttl is 900`, `list returns every key when the client reports more than one page` (mock returns 2500 keys); S3 client tests (offline): `presignGetObject targets <account>.r2.cloudflarestorage.com with X-Amz-Expires equal to the requested ttl`, `listKeys follows ContinuationToken until exhausted` (stub the SDK `send`); module tests as in Task 3 (`declares its required env`, `provides a real R2StorageStrategy when env present`).
- [ ] **Step 3: Run** `yarn nx test storage-r2` — FAIL. **Step 4: Implement** all files per Interfaces (region `auto`, `endpoint https://<accountId>.r2.cloudflarestorage.com`; `listKeys` paginates `ListObjectsV2`; module follows `minio-storage.module.ts`, service label `'upload MS'`, provider `'r2'`, fake `FakeStorageStrategy`). **Step 5: Run** — PASS.
- [ ] **Step 6: Quality gate** (`prettier`, `yarn nx lint storage-r2`, `yarn nx build storage-r2`). **Step 7: Commit** `feat(storage-r2): R2 storage strategy` including `yarn.lock`.

### Task 5: create-icore option, config, wizard, manifest, audit, env

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts` (`DbProvider` += `'d1'`; `UploadProvider` += `'r2'`), `src/lib/config.ts` (`DB_PROVIDERS`, `UPLOAD_PROVIDERS`), `src/lib/prompts.ts` (wizard options "Cloudflare D1 (SQLite over REST)" and "Cloudflare R2 (S3-compatible)"), `src/manifest/index.ts` (units `db.d1`, `storage.r2`), `src/manifest/audit.ts` (`PROVIDER_SDKS.r2`), `src/lib/scaffold-env.ts` (`ROOT_PROVIDER_SDKS.r2`, `writeUploadEnv` r2 block, `writeNotesEnv` d1 block)
- Modify: `apps/microservices/{notes,upload,ai-orchestrator}/.env.example` (commented D1 / R2 variables)
- Test: `tools/create-icore/src/lib/__tests__/config.unit.test.ts`, `prompts.unit.test.ts`, `src/manifest/__tests__/wire-db.unit.test.ts`, `src/manifest/__tests__/wire-storage.unit.test.ts`, `wire-ai-usage-db.unit.test.ts`

**Interfaces:**

- Manifest units: `db.d1 = { libDirs: ['libs/db-strategies/d1'], deps: {}, tsPaths: { '@icore/db-d1': ['libs/db-strategies/d1/src/index.ts'] }, nestModule: { importFrom: '@icore/db-d1', symbol: 'D1DbModule', into: 'notes' } }`; `storage.r2 = { libDirs: ['libs/storage-strategies/r2'], deps: { '@aws-sdk/client-s3': <root version>, '@aws-sdk/s3-request-presigner': <root version> }, tsPaths: { '@icore/storage-r2': ['libs/storage-strategies/r2/src/index.ts'] }, nestModule: { importFrom: '@icore/storage-r2', symbol: 'R2StorageModule', into: 'upload' } }`.
- `PROVIDER_SDKS.r2` and `ROOT_PROVIDER_SDKS.r2` = the two AWS packages. `d1` has no SDK entry.

- [ ] **Step 1: Write failing tests**: config accepts `dbProvider: 'd1'` and `upload: 'r2'` and still rejects unknown values (extend the existing cases); `parseFlags(['my-app','--db=d1','--upload=r2'])` yields both; wizard lists both options; `wire-db` fixture gains a `d1` dir and `writeDbProvider(dir,'d1')` writes `D1DbModule.forRoot` import from `@icore/db-d1` and `cleanupUnusedDb(dir,'d1')` removes the other providers' dirs but keeps `d1`; the storage wiring analogue for `r2` (`writeStorageProvider`/`cleanupUnusedStorage`) incl. that choosing `r2` removes `libs/storage-strategies/minio` and the `minio` dep; `writeUploadEnv` with `upload: 'r2'` appends the four `R2_*` keys; `writeNotesEnv` with `dbProvider: 'd1'` appends the three `D1_*` keys; audit reports a `forbidden-dep` for `@aws-sdk/client-s3` when `upload` is not `r2` and none when it is.
- [ ] **Step 2: Run** `yarn nx test create-icore` — FAIL. **Step 3: Implement** the edits listed under Files, mirroring how `sqlite` and `minio` appear in each file. Inspect how `ai-orchestrator`'s `.env` receives DB credentials for other providers (`grep -n 'POSTGRES_URL' tools/create-icore/src/lib/scaffold-env.ts`, writer near line 371); give `d1` the same treatment, or if no other provider is handled there, document the manual `D1_*` step in the runbook (Task 7) instead of adding new code.
- [ ] **Step 4: Run** `yarn nx test create-icore` — PASS (whole suite; fix any test that enumerates providers). **Step 5:** `prettier`, `yarn nx lint create-icore`, `yarn nx build create-icore`. **Step 6: Commit** `feat(create-icore): d1 db and r2 upload providers`.

### Task 6: Scaffold integration, Supabase-separation test, CI smoke, template shell

**Files:**

- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` (extend following the file's existing fixture style) or a new sibling `scaffold-cloudflare.unit.test.ts`
- Modify: `.github/workflows/pipeline.yml` (scaffold-smoke combos) and, if it lists combos, `.github/workflows/scaffold-smoke-matrix.yml`; `tools/create-icore/_template-shell/package.json` via script; `tools/create-icore/templates/` via script

- [ ] **Step 1: Write failing integration test** scaffolding with `{ authProvider: 'supabase', dbProvider: 'd1', upload: 'r2', example: 'notes', ai: 'llm-router' }` and asserting: `apps/microservices/notes/src/app/db.provider.ts` imports `@icore/db-d1`; `apps/microservices/upload/src/app/storage.provider.ts` imports `@icore/storage-r2`; `apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts` imports `@icore/db-d1`; `libs/db-strategies/supabase`, `libs/storage-strategies/supabase`, `libs/storage-strategies/minio`, `libs/db-strategies/sqlite` do not exist; `libs/auth-strategies/supabase` exists; no generated package.json lists `minio` or `better-sqlite3`; `auditProject` returns no violations.
- [ ] **Step 2: Run** — FAIL (until Task 5 is in); fix any wiring gap the test exposes. **Step 3: Run** — PASS.
- [ ] **Step 4: Sync template shell**: run `node tools/create-icore/scripts/sync-template-shell.mjs` (new root deps), then `yarn nx test create-icore` to confirm `template-shell-drift.unit.test.ts` passes.
- [ ] **Step 5: CI smoke**: read how `scaffold-smoke` shards enumerate combos in `pipeline.yml` and add one shard/entry for `--auth=supabase --db=d1 --upload=r2` (same transport/pm as a neighbouring entry); mirror it in `scaffold-smoke-matrix.yml` only if that file lists combos. Run locally: `node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase --db=d1 --upload=r2 --transport=tcp --pm=yarn --mode=link` (build `create-icore` and snapshot templates first as the script requires) — expect build + lint green.
- [ ] **Step 6: Commit** `test(create-icore): d1+r2 scaffold integration and smoke combo`.

### Task 7: Docs, changeset, final gates

**Files:**

- Create: `docs/runbooks/cloudflare-d1-r2.md`, `.changeset/cloudflare-d1-r2-providers.md`
- Modify: `AGENTS.md` (D1 and R2 sections under "Provider-specific Setup"), `README.md` (provider lists), `docs/runbooks/third-party-infra-audit-fixes.md` only if it enumerates providers

- [ ] **Step 1: Runbook** covering: creating the D1 database and an API token (permission D1 Edit), R2 bucket + S3 API token, env blocks (exact variable names from Global Constraints), `create-icore --db=d1 --upload=r2` example, known limits (REST latency, 100 bound params, 2 MB row, presigned URLs only on the `r2.cloudflarestorage.com` domain, no bucket auto-create), the manual `D1_*` step for `ai-orchestrator` if Task 5 did not automate it, and that API-on-Workers, Durable Object sessions, jobs/payment/AI on Workers and `--host=cloudflare` are deferred (link the spec).
- [ ] **Step 2: AGENTS.md / README** sections mirroring the existing MinIO and Postgres entries (env vars, setup steps).
- [ ] **Step 3: Changeset** `.changeset/cloudflare-d1-r2-providers.md`: frontmatter `"@idevconn/create-icore": minor`, one-line description.
- [ ] **Step 4: Gates** in order: `npx prettier --write` on every touched file; `yarn nx run-many -t lint test build -p db-d1 storage-r2 create-icore`; `git status` — discard unintended `tools/create-icore/templates/` drift (or intentionally re-snapshot with `node tools/create-icore/scripts/snapshot-templates.mjs` then `node tools/create-icore/scripts/check-tarball-dotfiles.mjs`) as the LAST step; confirm `yarn.lock` is committed.
- [ ] **Step 5: Commit** `docs: Cloudflare D1/R2 runbook, AGENTS and changeset`; then `gh pr list --state all --limit 10`, push the branch, open the PR with `gh pr create --base dev`, wait for CI, report the link and CI result. Do not merge.

## Optional live verification (not in CI)

If the requester supplies a D1 database id, account id, and a D1-Edit token plus an R2 bucket and S3 keys, run a throwaway script under the scratchpad that exercises `D1DBStrategy` (`set/get/update/list` with a numeric and a boolean filter, `delete`) and `R2StorageStrategy` (`upload`, `list`, `getSignedUrl` fetch, `remove`) against the real services, and record the result in the PR description. Never commit credentials.
