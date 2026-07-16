# Progress Ledger — PR5: dependency-plumbing

Branch: bug/postgres-dep-plumbing (worktree: .claude/worktrees/bug+postgres-dep-plumbing)
Base: dev @ 8d8e140 (includes PR1-4, #238/#239/#241/#242, docs archive #240)
Plan: docs/superpowers/plans/2026-07-14-pr5-dependency-plumbing.md (already committed on dev via #240)

## Tasks
- [x] Task 1: pnpm root devDep fix covers postgres too
- [x] Task 2: writeProvider merges chosen provider's own deps into MS package.json
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): Ready to merge, 0 Critical/Important, 2 Minor (mergeJsonDeps catch-all swallows real errors not just ENOENT — consistent with existing stripJsonKeys pattern, not introduced by this PR; writeDbProvider gated on example!=none — pre-existing, out of scope). Confirmed axis-agnostic (auth/storage/db all correctly covered), Fix1/Fix2 independent, no template drift, series-level sanity clean (only touches files PR1-4 didn't).

DONE. Branch bug/postgres-dep-plumbing ready for PR --base dev. LAST PR of the 5-PR series (PR1 #238, PR2 #239, PR3 #241, PR4 #242, docs archive #240 — all merged).

Task 2: complete (commit 985442f..028edb0, review clean — 1 Minor noted: axis-specific tests pre-seeded every provider's deps, never exercising the real postgres-missing-from-template scenario the fix targets). Verified end-to-end manually against a real scaffold (node scaffold() call, --auth=postgres) — apps/microservices/auth/package.json correctly gained @icore/auth-postgres/postgres/bcrypt/jsonwebtoken. User then asked to close the Minor gap with a real test: added in 4265338 (parameterized fixture(), new case proving writeAuthProvider('postgres') merges deps into a package.json that realistically starts without them, matching the real template). Re-review confirmed sound — version strings match manifest exactly, test would fail pre-fix, no scope creep. All 3 axis-adjacent suites + full create-icore suite green (179 tests).

Task 1: complete (commit 8d8e140..985442f, review clean, 0 findings). Simple condition-widening fix, well-tested negative case included.

Reminders (from memory):
- Any package.json dep edit → yarn install + commit yarn.lock.
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr5-execution-record/ and commit BEFORE opening the PR.
- Watch for tools/create-icore/templates/** stray drift after running nx build/smoke scripts — discard, don't commit (known artifact-resync noise, hit in PR1 and PR4).
