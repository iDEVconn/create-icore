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

