# Progress Ledger — PR4: shadcn-ui-gaps

Branch: bug/shadcn-oauth-gating-and-dead-tokens (worktree: .claude/worktrees/bug+shadcn-oauth-gating-and-dead-tokens)
Base: dev @ 86ca4e8 (includes PR1 #238, PR2 #239, PR3 #241, docs archive #240)
Plan: docs/superpowers/plans/2026-07-14-pr4-shadcn-ui-gaps.md (corrected in commit 776414e — client-shadcn DOES have a working RTL test harness, root-hoisted @testing-library/react + jsdom; Task 1 now has a real automated test, not manual-only)

## Tasks
- [x] Task 1: Gate OAuth buttons + magic-link toggle on provider capability
- [x] Task 2: Define the missing popover/accent CSS tokens
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): initially "Not ready" — 1 Important finding: writeClientEnv appended VITE_AUTH_HAS_OAUTH/MAGIC_LINK to .env.example's own hardcoded false/false placeholders instead of replacing, producing duplicate contradictory lines in every supabase/firebase scaffold's generated .env (worked only via dotenv last-wins). Fixed in 838d34c: regex-replace instead of append; strengthened the 4 unit tests to assert exactly-one-occurrence (previous toContain assertions passed even with the duplicate present). Re-review confirmed sound (simulated reverting the fix — new tests correctly fail). Ready to merge.

DONE. Branch bug/shadcn-oauth-gating-and-dead-tokens ready for PR --base dev.

Task 2: complete (commit 841eb4b..6d96c4d, review clean, 0 findings). Simple CSS-only fix, build-verified.

Task 1: complete (commits 776414e..11abe51, fix 841eb4b, review clean after fix). 3 sound deviations from brief (unused import removed; @testing-library/jest-dom not installed anywhere in repo, replaced toBeInTheDocument with queryByText().toBeNull()/getByText().toBeDefined(); client-shadcn's build target is vite:build not build). 1 Important finding fixed: original 2 test cases never diverged the two flags (both true or both false), so a swapped gate wouldn't be caught — added 2 mixed-flag cases, reviewer simulated the swap bug and confirmed both new cases would catch it.

Reminders (from memory):
- Any package.json dep edit → yarn install + commit yarn.lock.
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr4-execution-record/ and commit BEFORE opening the PR.
