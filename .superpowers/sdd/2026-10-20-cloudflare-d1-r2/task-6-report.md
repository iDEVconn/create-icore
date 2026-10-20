# Task 6 report: d1+r2 scaffold integration, CI smoke combo, template shell

**Status:** DONE_WITH_CONCERNS (the concerns are minor; see below)
**Commit:** `8dc43da test(create-icore): d1+r2 scaffold integration and smoke combo` on `feature/cloudflare-d1-r2`

## What was implemented

1. **Integration test** in a new sibling file, `tools/create-icore/src/lib/__tests__/scaffold-cloudflare.unit.test.ts`. The existing file is 1,400 lines, and its fake-fixture `makeFakeTemplates()` has no d1/r2/ai-orchestrator/minio/sqlite stubs.
   - **Harness choice:** the test scaffolds from the **real `templates/` snapshot**. This follows the existing PnP test in `scaffold.integration.unit.test.ts`, which does the same with `realTemplatesDir`. It is safe because the `create-icore:test` target `dependsOn: ["snapshot-templates"]`, so the snapshot is always fresh when the test runs. A fake fixture could not prove that the real libs and provider files ship.
   - **Options:** `{ authProvider: 'supabase', dbProvider: 'd1', upload: 'r2', example: 'notes', ai: 'llm-router', payment: 'none', jobs: 'none', ui: 'shadcn', transport: 'tcp', session: 'redis' }`
   - **Six assertions:**
     - notes `db.provider.ts` imports `@icore/db-d1`.
     - upload `storage.provider.ts` imports `@icore/storage-r2`.
     - ai-orchestrator `ai-usage-db.provider.ts` imports `@icore/db-d1`.
     - `libs/auth-strategies/supabase` exists.
     - `libs/db-strategies/{supabase,sqlite}` and `libs/storage-strategies/{supabase,minio}` are absent.
     - No root or `apps/**` package.json lists `minio` or `better-sqlite3`.
     - `auditProject(outDir)` returns `[]`.
2. **CI, `.github/workflows/pipeline.yml`:**
   - Added `cloudflare-d1-r2|--auth=supabase --db=d1 --upload=r2 --payment=none --jobs=none --example=notes --transport=tcp` to `scaffold-smoke` shard 2. Both shards had 4 combos; shard 2 holds the lighter ones (shard 1 carries `supabase-full` with every feature).
   - Updated the comment from "Two shards of four combos … eight times" to "Two shards (four and five combos) … nine times".
3. **CI, `.github/workflows/scaffold-smoke-matrix.yml`:** added the `cloudflare-d1-r2-tcp-shadcn` entry with the exact flags from the brief, after `supabase-minimal-tcp-memory-shadcn`. No `uses:` pins were touched.
4. **Template shell:**
   - `node tools/create-icore/scripts/sync-template-shell.mjs` reported **0 dependency versions synced**, so `_template-shell/package.json` is unchanged and nothing was committed for it.
   - The reason: the script only re-pins dependencies present in BOTH the root and the shell. The `@aws-sdk/*` packages are not shell dependencies; like `minio`, they ride in the generated upload MS `package.json`. The audit mutation below confirms `apps/microservices/upload/package.json` carries `@aws-sdk/client-s3`.
   - `template-shell-drift.unit.test.ts` passes.
   - `TRANSPORT_DEPS` / `MONGODB_DEPS` in `scaffold-env.ts` need no change: they are unrelated to the AWS deps, and drift is green.

## TDD evidence

- **First run: passed immediately (6/6).** The Task 5 wiring was already complete, so no wiring gap was exposed.
- **Mutation 1:** switched the options to `dbProvider: 'supabase', upload: 'minio'`. Result: 5 failed, 1 passed. Every wiring, absence and package.json assertion went red. The audit stayed green, which is correct because that combination is internally consistent.
- **Mutation 2:** called `auditProject(outDir, { forbiddenDeps: ['@aws-sdk/client-s3'] })`. Result: the audit test failed with "`…/apps/microservices/upload/package.json keeps forbidden dep @aws-sdk/client-s3`".
- Both mutations were restored from a scratch copy, and `git status` was checked clean before committing.

## Smoke run (exact commands)

```
NX_DAEMON=false NX_ISOLATE_PLUGINS=false yarn nx build create-icore          # green
node tools/create-icore/scripts/snapshot-templates.mjs                        # templates written
node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase --db=d1 --upload=r2 --payment=none --jobs=none --example=notes --transport=tcp --pm=yarn --mode=link --projects=shared,firebase-admin,auth,upload,notes,jobs,payment,ai-orchestrator,api
```

- **Result:** EXIT=0, "✓ audit clean", and "✓ smoke OK — typecheck clean". `tsc --noEmit` passed for shared, auth (app and spec), upload (app and spec), notes and api (app and spec). firebase-admin, jobs, payment and ai-orchestrator were skipped as not in the combo.
- I used the same `--projects` list as the CI job.
- **Extra run** with `--ai=llm-router` added (matches the matrix entry): EXIT=0, audit clean, typecheck clean, and this time ai-orchestrator was included.
- **What did NOT run:**
  - Lint in link mode: the script ignores lint in link mode, because it needs a real install.
  - Install mode (`--mode=install`).
  - The boot phase (`--run`) that the nightly matrix uses.

## Verification

- `yarn nx test create-icore` (whole suite): 40 files, **363 tests passed**.
- `yarn nx lint create-icore`: green.
- `yarn nx build create-icore`: green.
- Prettier on the 3 touched files: unchanged.
- The pre-commit hook (lint-staged plus affected lint/test) passed.
- I ran `git checkout -- tools/create-icore/templates` after the snapshot/build. The untracked snapshot output is gitignored, and nothing under `templates/` was committed.

## Files changed

- `tools/create-icore/src/lib/__tests__/scaffold-cloudflare.unit.test.ts` (new)
- `.github/workflows/pipeline.yml`
- `.github/workflows/scaffold-smoke-matrix.yml`

## Self-review / concerns

- **Nightly boot not run locally.** The nightly matrix entry boots services (`--run`) with no real Cloudflare credentials. I checked by reading the code: `D1DbModule` / `R2StorageModule` use `cfg.getOrThrow` for `D1_*` / `R2_*`, and `scaffold-env.ts` writes non-empty placeholder values for every key. Construction does no network I/O, so boot should not crash. I did not run it locally, so the first nightly run is the real proof.
- **Stale counts in older comments.** In `pipeline.yml`, "The four combos form a covering set … upload×4" was already outdated before this task (8 combos). In `scaffold-smoke-matrix.yml`, "the same 4-combo covering set" is outdated too. I left both alone to stay in scope; Task 7 or docs could refresh them.
- **No Layer A coverage for d1/r2 with ai.** The Layer A combo has no `--ai` (the brief's flags are verbatim), so ai-orchestrator with d1 is only covered by the nightly matrix and by the new integration test. I verified it locally with the extra `--ai` smoke run.
