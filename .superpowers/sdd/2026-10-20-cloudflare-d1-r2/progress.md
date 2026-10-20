# SDD ledger — plan: docs/superpowers/plans/2026-10-20-cloudflare-d1-r2.md

Spec: docs/superpowers/specs/2026-10-20-cloudflare-d1-r2-design.md (reachable, binding)
Branch: feature/cloudflare-d1-r2 (cut from dev 0aff046). Single checkout, one implementer at a time; no extra worktree (branch already isolates from dev).
Execution authority: user approved plan + subagent-driven (2026-10-20). Commits per task are in-plan; push/PR only at the end (never merge).

## Pre-flight conflict scan

| Pair / task | Shared surface | Finding |
|---|---|---|
| T1 ↔ T2 | `D1ClientLike`, `D1Param`, `D1QueryResult` | T2 consumes exactly T1's produced signatures. OK |
| T1 ↔ T3 | `createD1RestClient(opts)` | T3 needs accountId/databaseId/apiToken from env; matches T1 options. OK |
| T2 ↔ T3 | `D1DBStrategy(client)` | ctor signature matches. OK |
| T1/T2/T3 | `libs/db-strategies/d1/src/index.ts` | each task appends exports; no conflict if appended. OK |
| T2 | test uses `node:sqlite` under Vitest/Vite 8 | Risk: Vite may fail to resolve `node:sqlite`. Ruling R1 below. |
| T4 ↔ T5 | `R2StorageModule` symbol, AWS dep versions | T5 manifest must copy the exact versions T4 put in root package.json. Carry in T5 dispatch. OK |
| T4 ↔ T6 | root package.json / yarn.lock | T6 runs sync-template-shell after T4 deps. Order OK |
| T5 ↔ T6 | manifest units, audit, env writers | T6 test depends on T5 wiring. Order OK |
| T5 ↔ T7 | ai-orchestrator D1_* env | T5 decides automate-or-document; T7 runbook documents if not automated. Carry result forward. OK |
| T1 self | creates lib via generator; lists `Modify: root package.json (none expected)` | consistent |
| T2 self | tests (typed+stringified modes) vs code (CAST rule) | consistent with spec param rule |
| T3 self | tests match sqlite/minio module pattern | consistent |
| T4 self | 'clamp 604800' tested; mock returns 2500 keys → pagination test targets S3 client (stub send), strategy test targets mock listKeys | consistent; mock must return all keys |
| T5 self | tests list `writeStorageProvider` etc.; files exist | consistent |
| T6 self | asserts `ai-usage-db.provider.ts` imports `@icore/db-d1` | requires `ai: 'llm-router'` in scaffold opts; present |
| T7 self | runbook/AGENTS/changeset/gates | consistent |
| Plan vs spec | Spec: "MIME allowlist … as in other storage strategies" | Ruling R2 below |

Ruling: R1 — if `node:sqlite` fails to resolve under Vitest, load it with `createRequire(import.meta.url)('node:sqlite')` inside the test helper instead of changing the test-runner config — keeps the change local to the test-only file — costs a slightly uglier import if wrong.
Ruling: R2 — R2StorageStrategy gets NO MIME allowlist, matching MinioStorageStrategy (which has none; the AGENTS.md sentence is stale) — avoids behavior the sibling lacks and contract tests don't require — costs a later hardening task if a real allowlist is wanted.
Ruling: R3 — commit .superpowers/sdd/* artifacts into the branch (user memory: feedback-commit-sdd-execution-record) — records the execution — costs repo noise.


Task 1: implemented (commit 08cd04a), review: spec ✅, quality Needs fixes (2 Important). ⚠️ items resolved by controller: nx targets test/lint/build present, trailer present, templates untouched.
Task 1: minor (deferred): d1-client retries any non-timeout thrown error (incl. non-network TypeError, mid-flight reset) — add comment or narrow
Task 1: minor (deferred): Retry-After uncapped; HTTP-date Retry-After falls back to backoff
Task 1: minor (deferred): success:true with no result[0] returns empty rows silently
Task 1: minor (deferred): tests don't assert backoff values (250/500 ms) nor sleep in network-error test
Task 1: minor (deferred): eslint ignoredDependencies hides @nestjs/common,config until Tasks 3+ use them (remove ignore then)
Task 1: fix round 1/5 (2 addressed, 0 open; commits 08cd04a..c20e50c)
Task 1: complete (commits 6d580af..c20e50c, review clean)

Task 2: implemented (commit 1129ab5), review: spec ✅, quality Needs fixes (1 Important: guard-ordering test can't fail on ordering)
Task 2: minor (deferred): too_many_params check duplicated in run() and list() — extract assertParamCount
Task 2: minor (deferred): CAST(... AS NUMERIC) false positives (== 0 / == false match non-numeric strings; == 30 matches "30") — spec-mandated; add comment
Task 2: minor (deferred): no tests for `in []`, mixed-type `in`, exactly-100 params allowed
Task 2: fix round 1/5 (1 addressed, 0 open; commits 1129ab5..9864353)
Task 2: complete (commits e34c82d..9864353, review clean)

Task 3: implemented (commit 92b7f66), review: spec ✅, quality Approved, 0 Critical/Important. ⚠️ lint green verified by controller (nx cache hit).
Task 3: minor (deferred): fallback test emits console.warn banner noise — spy on console.warn
Task 3: minor (deferred): production-throw path (NODE_ENV=production + missing env) untested; belongs to buildStrategyWithFallback
Task 3: minor (deferred): stub ConfigService.getOrThrow returns undefined instead of throwing
Task 3: complete (commits 4688083..92b7f66, review clean)
Note: controller accidentally ran `prettier --write docs/superpowers` (95 unrelated old plan/spec files reformatted); reverted with `git checkout -- docs/superpowers` before any commit — no unrelated change was committed. Only run prettier on specific files from now on.

Task 4: implemented (commit 42f123e), review: spec ❌ (TTL lower/NaN guard missing), quality Needs fixes (1 Important). ⚠️ resolved by controller: yarn.lock workspace entry / lint / templates checked (see below).
Task 4: minor (deferred): truncated listing without NextContinuationToken ends silently (should throw)
Task 4: minor (deferred): inconsistent import extensions (.js in index.ts only)
Task 4: minor (deferred): createMockR2.deleteObject throws not_found (S3 delete is idempotent)
Task 4: minor (deferred): no test for FakeStorageStrategy fallback when env missing, nor NoSuchBucket propagation
Task 4: minor (deferred): 2500-key strategy test only exercises the mock (redundant)
Ruling: R4 — fold the automated security-review finding (path traversal / prefix check vs key normalization, r2-storage.strategy.ts) into fix round 1: sanitize filename separators in upload, and harden assertOwner to reject `.`/`..`/empty segments and backslashes — cheap defense in depth in the file under change — costs a small scope increase beyond the brief (tests added).
Ruling: R5 — invalid TTL (NaN/non-finite/<=0) throws `invalid_ttl`, TTL above 604800 clamps, non-integer floors — spec says "clamped"; a silent default would hide caller bugs — costs a behavior choice the spec did not pin.
Deferred observation (outside this PR): gateway `assertOwnership` and `MinioStorageStrategy.assertOwner` have the same prefix-only check; consider hardening all storage providers + gateway in a follow-up.
Task 4: fix round 1/5 (2 addressed, 0 open; commits 42f123e..5f07a45) — implementer also made TTL flooring below 1 (e.g. 0.5) throw invalid_ttl; re-reviewer judged it sound.
Task 4: minor (deferred): `list(userId, prefix)` does not sanitize prefix; omitted-TTL=900 assertion not in fix diff (may be covered earlier)
Task 4: complete (commits d277346..5f07a45, review clean). AWS SDK versions: @aws-sdk/client-s3 ^3.1153.0, @aws-sdk/s3-request-presigner ^3.1153.0 (root + lib).

Task 5: implemented (commit f5c15ec), review: spec ❌ (ai-orchestrator env misread), quality Needs fixes (1 Important; confirmed by controller: ai-orchestrator and notes ENV_PATHS fall back to root .env; writeRootEnv carries POSTGRES_URL/MONGODB_URI)
Task 5: minor (deferred): placeholder `<cloudflare-…>` values defeat fail-fast (getOrThrow passes on any non-undefined)
Task 5: minor (deferred): wire-storage cleanup test doesn't explicitly assert minio dir existence in supabase-chosen case; prompts test finds call by message without mockClear
Task 5: minor (deferred): tools/create-icore/README.md:26 upload provider list stale (no minio) — Task 7 docs
Task 5: fix round 1/5 (1 addressed, 0 open; commits f5c15ec..3bf30c3)
Task 5: complete (commits ec1960d..3bf30c3, review clean). CARRY TO TASK 7: NO manual `D1_*` step for ai-orchestrator — writeRootEnv puts D1_* in root .env which ai-orchestrator and notes both load; ignore stale lines 56/116 of task-5-report.md. CARRY TO TASK 6: `_template-shell/package.json` lacks the two AWS SDK packages (^3.1153.0) — run sync-template-shell.mjs; `tools/create-icore/templates/` gets dirtied by build — discard.

Task 6: implemented (commit 8dc43da), review: spec ✅, quality Approved, 0 Critical/Important. Smoke (link mode, with and without --ai=llm-router): green; install mode and --run boot phase NOT run locally (nightly will).
Task 6: minor (deferred): scaffold-cloudflare.unit.test.ts mkdtemp dir never removed (add afterAll rm)
Task 6: minor (deferred): packageJsons walk covers apps/ only, not libs/
Task 6: minor (deferred): pipeline combo omits --ai (nightly matrix covers ai path)
Task 6: complete (commits 7b03a55..8dc43da, review clean). sync-template-shell synced 0 deps (AWS packages ship in generated upload service package.json).
Ruling: R6 — Task 7 dispatch excludes push/PR creation; controller does push + `gh pr create --base dev` only after the final whole-branch review, per AGENTS.md (never merge) — keeps outward-facing step behind the final review — costs nothing.
