# Task 5 report: create-icore d1 / r2 wiring

**Status:** DONE
**Commit:** `f5c15ec feat(create-icore): d1 db and r2 upload providers` (branch `feature/cloudflare-d1-r2`, pre-commit hook passed, not pushed)

## What was implemented

- `DbProvider` gains `'d1'` and `UploadProvider` gains `'r2'`. `StorageProvider` in `manifest/types.ts` is `Exclude<UploadProvider,'none'>`, so it picks up `r2` with no edit, and `Manifest.storage`/`Manifest.db` (both `Record<...>`) now require the new units, which the type checker enforces.
- Config validation (`DB_PROVIDERS`, `UPLOAD_PROVIDERS`) accepts `d1` and `r2`. Flag validation in `collectOptions` uses the same lists.
- The wizard has two new options:
  - `{ value: 'd1', label: 'Cloudflare D1 (SQLite over REST)' }`, placed after sqlite.
  - `{ value: 'r2', label: 'Cloudflare R2 (S3-compatible)' }`, placed after minio.
- Two new manifest units, using the values from the brief verbatim:
  - `db.d1`: `libDirs ['libs/db-strategies/d1']`, `deps {}`, `@icore/db-d1` tsPath, `nestModule { '@icore/db-d1', 'D1DbModule', 'notes' }`.
  - `storage.r2`: `libDirs ['libs/storage-strategies/r2']`, deps `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, both `^3.1153.0` (copied from root package.json), `@icore/storage-r2` tsPath, `nestModule { '@icore/storage-r2', 'R2StorageModule', 'upload' }`.
- `PROVIDER_SDKS.r2` (audit.ts) and `ROOT_PROVIDER_SDKS.r2` (scaffold-env.ts) both list the two AWS packages. d1 gets no SDK entry.
- `writeUploadEnv` with `upload === 'r2'` appends four lines: `R2_ACCOUNT_ID=<cloudflare-account-id>`, `R2_ACCESS_KEY_ID=<r2-access-key-id>`, `R2_SECRET_ACCESS_KEY=<r2-secret-access-key>`, `R2_BUCKET=icore-uploads`.
- `writeNotesEnv` with `dbProvider === 'd1'` appends three lines: `D1_ACCOUNT_ID=<cloudflare-account-id>`, `D1_DATABASE_ID=<d1-database-id>`, `D1_API_TOKEN=<cloudflare-api-token>`.
- `.env.example` files now carry commented D1/R2 examples:
  - `upload`: a `# STORAGE_PROVIDER=r2` line plus a commented R2 credentials block.
  - `notes` and `ai-orchestrator`: a commented D1 credentials block.
- ai-usage DB wiring needed **no code change**. `wire-ai-usage-db.ts` reads `MANIFEST.db`, and new tests show `writeAiUsageDbProvider(dir,'d1')` emits the `D1DbModule` import and that `cleanupUnusedAiUsageDb(dir,'d1')` keeps d1.

## Every place that enumerated providers (from grepping `sqlite` / `minio` in tools/create-icore/src)

| Place | Change |
|---|---|
| `src/lib/options.ts` `DbProvider` / `UploadProvider` | + `'d1'` / + `'r2'` |
| `src/lib/config.ts` `DB_PROVIDERS` / `UPLOAD_PROVIDERS` | + `'d1'` / + `'r2'` |
| `src/lib/prompts.ts` wizard selects | + D1 option / + R2 option |
| `src/manifest/types.ts` `StorageProvider` | derived, so it updates automatically (no edit) |
| `src/manifest/index.ts` `storage` / `db` sections | + `r2` unit / + `d1` unit |
| `src/manifest/audit.ts` `PROVIDER_SDKS` | + `r2` |
| `src/lib/scaffold-env.ts` `ROOT_PROVIDER_SDKS` | + `r2` |
| `src/lib/scaffold-env.ts` `writeUploadEnv` / `writeNotesEnv` | + r2 block / + d1 block |
| tests: `wire-db`, `wire-storage`, `wire-ai-usage-db` fixtures | gain `d1` / `minio` + `r2` dirs, deps and paths |
| tests: `config`, `prompts`, `scaffold-env`, `audit` | new cases (below) |

Places I found but left alone:
- The `prompts.unit.test.ts` sqlite separator test needed no change.
- `tools/create-icore/README.md`, `scripts/` and `migrations/` contain no sqlite/minio enumeration.
- `_template-shell/package.json` mentions minio, but it belongs to Task 6 (template-shell sync), so I did not touch it.
- There are no help/usage strings listing providers in `src`.

## ai-orchestrator env decision

> **CORRECTED in fix round 1 (see the end of this report).** The original conclusion below was a misread. Other DB providers reach ai-orchestrator through the ROOT `.env`, which `writeRootEnv` writes and which both ai-orchestrator and notes `app.module.ts` load as a fallback. d1 now gets the same treatment, so **no manual runbook step is needed for ai-orchestrator**.

Original (superseded) text:

`writeAiEnv` (scaffold-env.ts, about line 371) only rewrites `AI_TRANSPORT` and uncomments the transport lines. It handles **no** DB-provider credentials for any provider:
- `POSTGRES_URL` is written only by `writeAuthEnv` and the root `.env`.
- `MONGODB_URI` goes to auth/upload/root.
- `SQLITE_*` goes to notes only.

Following the brief, I added **no new code** for d1 there. A d1 project's `ai-orchestrator/.env` will not get `D1_*` keys automatically; Task 7 must document the manual `D1_*` step in the runbook. The commented D1 block in `apps/microservices/ai-orchestrator/.env.example` is in place as a hint.

## Tests and TDD evidence

New or extended tests:
- **config:** accepts `{dbProvider:'d1', upload:'r2'}`; rejects `d2` / `r3` with `ConfigFileError`.
- **prompts:** `parseFlags(['my-app','--db=d1','--upload=r2'])` returns both values. The wizard test mocks `clack.select`, then asserts the "Database backend" options contain the D1 label and the "File upload provider" options contain the R2 label, and that the selections flow through to the result.
- **wire-db:** the fixture gains `d1`. New cases cover `writeDbProvider(dir,'d1')` (`import { D1DbModule } from '@icore/db-d1'` and `D1DbModule.forRoot`) and `cleanupUnusedDb(dir,'d1')` (keeps d1, removes the other 5 dirs, deps and paths). The existing firebase/sqlite cleanup cases now also assert that d1 is removed.
- **wire-storage:** the fixture gains `minio` and `r2` (libs, deps, paths).
  - `writeStorageProvider(dir,'r2')` writes the R2 import and merges `@icore/storage-r2` plus both AWS deps into the upload package.json.
  - `cleanupUnusedStorage(dir,'r2')` keeps r2 and its AWS deps, and removes `libs/storage-strategies/minio`, `@icore/storage-minio` and `minio`.
  - The supabase cleanup case now also asserts that r2 and the AWS deps are removed.
- **wire-ai-usage-db:** covers `d1` provider wiring and `d1` cleanup.
- **scaffold-env:** covers the r2 upload env (4 keys, each assigned exactly once, plus `STORAGE_PROVIDER=r2`), no R2 keys for other providers, the d1 notes env (3 keys), and no D1 keys for sqlite. It also covers `pruneRootProviderDeps`: both AWS packages are dropped when upload≠r2, and kept (with minio dropped) when upload=r2.
- **audit:** a `forbidden-dep` is reported for `@aws-sdk/client-s3` when upload=supabase, and `[]` when upload=r2.

**RED** (`NX_DAEMON=false NX_ISOLATE_PLUGINS=false yarn nx test create-icore --skip-nx-cache`, run before implementation):
```
× flags @aws-sdk/client-s3 as a forbidden dep when upload is not r2
× wires R2StorageModule from @icore/storage-r2 and declares its AWS SDK deps
× removes unchosen libs, their tsconfig paths, workspace+raw deps; keeps chosen   (storage)
× accepts dbProvider: "d1" and upload: "r2" (Cloudflare) and still rejects unknown values
× wires the chosen db module (d1)
× removes unchosen db libs (firebase→firestore dir), tsconfig paths, workspace+raw deps; keeps chosen
× cleans up unchosen and keeps sqlite when sqlite is chosen
× writeUploadEnv with upload=r2 selects r2 and appends the four R2_* keys
× writeNotesEnv with dbProvider=d1 appends the three D1_* keys
× drops both AWS SDK packages when upload is not r2
× wires D1DbModule for dbProvider=d1 (manifest-driven, no ai-usage-specific code)
× offers Cloudflare D1 as a database backend and Cloudflare R2 as an upload provider
Test Files  7 failed | 32 passed (39)
     Tests  12 failed | 343 passed (355)
```

**GREEN** (same command, after implementation and again after prettier):
```
Test Files  39 passed (39)
     Tests  355 passed (355)
```

Lint and build: `yarn nx run-many -t lint build -p create-icore --skip-nx-cache` reported "Successfully ran targets lint, build for project create-icore and 2 tasks it depends on". Prettier ran on the 13 touched `.ts` files; it only reformatted `options.ts`. `.env.example` files have no prettier parser, which matches how they were handled before.

## Files changed

- `apps/microservices/{ai-orchestrator,notes,upload}/.env.example`
- `tools/create-icore/src/lib/{config,options,prompts,scaffold-env}.ts`
- `tools/create-icore/src/manifest/{audit,index}.ts`
- `tools/create-icore/src/lib/__tests__/{config,prompts,scaffold-env}.unit.test.ts`
- `tools/create-icore/src/manifest/__tests__/{audit,wire-ai-usage-db,wire-db,wire-storage}.unit.test.ts`

## Self-review findings

- r2 has no dependency on `@icore/storage-minio` or `minio`. A test shows that choosing r2 prunes both.
- d1 has `deps: {}` and no SDK entry in either SDK table.
- AWS versions match the root package.json exactly (`^3.1153.0`).
- Running the build/test dirtied `tools/create-icore/templates/apps/microservices/{notes,upload}/.env.example`. I discarded it with `git checkout -- tools/create-icore/templates`; there were no untracked files. Nothing under `templates/` is committed. Task 7 owns the snapshot.
- For the env tests I used `scaffold-env.unit.test.ts`, the module's own test file, rather than the older `writeUploadEnv` tests in `scaffold.unit.test.ts`.

## Concerns

1. **ai-orchestrator `.env` for d1 is manual** (see the env decision above). Task 7 needs to document it.
2. **Template-shell drift:** `_template-shell/package.json` presumably needs the two AWS SDK deps so the root `ROOT_PROVIDER_SDKS.r2` prune has something to keep. That is Task 6's template-shell sync, which this task did not touch.
3. **Unchecked placeholder wording:** the D1 token comment in `.env.example` ("needs D1 Edit permission") is my wording and has not been checked against the Task 7 docs.

---

## Fix round 1 (review finding: ai-orchestrator env)

**Finding (Important):** My original ai-orchestrator env decision was wrong. `writeRootEnv` appends `POSTGRES_URL` / `MONGODB_URI` to the ROOT `.env`. Both `apps/microservices/ai-orchestrator/src/app/app.module.ts` (ENV_PATHS) and `apps/microservices/notes/src/app/app.module.ts` load that root `.env` as a fallback after their own `.env`.

Without D1 keys in the root `.env`, a project with `ai` enabled and `db=d1` wires `D1DbModule.forRoot` into `ai-usage-db.provider.ts`, and its `getOrThrow('D1_ACCOUNT_ID')` finds nothing. The service fails at boot, and this is worst with `example=none`, where there is no notes `.env` at all.

**Change:** in `tools/create-icore/src/lib/scaffold-env.ts`, `writeRootEnv` now appends three lines when `opts.dbProvider === 'd1'`, followed by a trailing blank line (the same pattern as the postgres/mongodb blocks):
- `D1_ACCOUNT_ID=<cloudflare-account-id>`
- `D1_DATABASE_ID=<d1-database-id>`
- `D1_API_TOKEN=<cloudflare-api-token>`

The notes `.env` d1 block is unchanged (it mirrors sqlite). **No manual runbook step is needed for ai-orchestrator**: it gets the D1 credentials from the root `.env`, exactly as postgres and mongodb do. The Task 5 handoff is corrected accordingly.

**Tests:** two new cases in `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` under `describe('writeRootEnv')`:
- `dbProvider: 'd1'`: the root `.env` contains `DB_PROVIDER=d1` and a `^KEY=` line for each of the three `D1_*` keys.
- `dbProvider: 'sqlite'`: the root `.env` contains no `D1_`.

**RED** (`cd tools/create-icore && npx vitest run src/lib/__tests__/scaffold.unit.test.ts -t writeRootEnv`):
```
✓ writes DB_PROVIDER=<chosen> to .env when dbProvider=firebase
✓ writes DB_PROVIDER=supabase to .env when dbProvider=supabase
✓ appends POSTGRES_URL to .env when dbProvider=postgres
× appends the three D1_* keys to the root .env when dbProvider=d1 (ai-orchestrator/notes fallback)
✓ does not append D1_* keys to the root .env for a non-d1 db (sqlite)
Tests  1 failed | 4 passed | 59 skipped (64)
```

**GREEN** (`NX_DAEMON=false NX_ISOLATE_PLUGINS=false yarn nx test create-icore --skip-nx-cache`):
```
Test Files  39 passed (39)
     Tests  357 passed (357)
```

`yarn nx run-many -t lint build -p create-icore --skip-nx-cache` reported "Successfully ran targets lint, build for project create-icore and 2 tasks it depends on".

Prettier ran on the 2 touched files; both were unchanged. The build dirtied `tools/create-icore/templates/`; I discarded it and there were no untracked files. `progress.md`, which the controller modified, was not staged.

**Commit:** `3bf30c3 fix(create-icore): write D1 credentials to root .env for ai-orchestrator`
