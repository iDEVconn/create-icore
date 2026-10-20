### Task 6: Scaffold integration, Supabase-separation test, CI smoke, template shell

**Files:**

- Test: `tools/create-icore/src/lib/__tests__/scaffold.integration.unit.test.ts` (extend following the file's existing fixture style) or a new sibling `scaffold-cloudflare.unit.test.ts`
- Modify: `.github/workflows/pipeline.yml` (scaffold-smoke combos) and, if it lists combos, `.github/workflows/scaffold-smoke-matrix.yml`; `tools/create-icore/_template-shell/package.json` via script; `tools/create-icore/templates/` via script

- [ ] **Step 1: Write failing integration test** scaffolding with `{ authProvider: 'supabase', dbProvider: 'd1', upload: 'r2', example: 'notes', ai: 'llm-router' }` and asserting: `apps/microservices/notes/src/app/db.provider.ts` imports `@icore/db-d1`; `apps/microservices/upload/src/app/storage.provider.ts` imports `@icore/storage-r2`; `apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts` imports `@icore/db-d1`; `libs/db-strategies/supabase`, `libs/storage-strategies/supabase`, `libs/storage-strategies/minio`, `libs/db-strategies/sqlite` do not exist; `libs/auth-strategies/supabase` exists; no generated package.json lists `minio` or `better-sqlite3`; `auditProject` returns no violations.
- [ ] **Step 2: Run** — FAIL (until Task 5 is in); fix any wiring gap the test exposes. **Step 3: Run** — PASS.
- [ ] **Step 4: Sync template shell**: run `node tools/create-icore/scripts/sync-template-shell.mjs` (new root deps), then `yarn nx test create-icore` to confirm `template-shell-drift.unit.test.ts` passes.
- [ ] **Step 5: CI smoke**: read how `scaffold-smoke` shards enumerate combos in `pipeline.yml` and add one shard/entry for `--auth=supabase --db=d1 --upload=r2` (same transport/pm as a neighbouring entry); mirror it in `scaffold-smoke-matrix.yml` only if that file lists combos. Run locally: `node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase --db=d1 --upload=r2 --transport=tcp --pm=yarn --mode=link` (build `create-icore` and snapshot templates first as the script requires) — expect build + lint green.
- [ ] **Step 6: Commit** `test(create-icore): d1+r2 scaffold integration and smoke combo`.

