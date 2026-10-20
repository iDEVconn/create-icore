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
