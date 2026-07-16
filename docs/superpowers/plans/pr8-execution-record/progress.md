# Progress Ledger — PR8: error-handling-and-replay-protection-polish

Branch: bug/error-handling-and-replay-protection-polish (worktree: .claude/worktrees/bug+error-handling-and-replay-protection-polish)
Base: dev @ 95399fb (independent of PR6/PR7, cut from same base)
Plan: docs/superpowers/plans/2026-07-15-pr8-minor-polish-error-handling-and-replay-protection.md

## Tasks
- [x] Task 1: Narrow wire-provider.ts's error swallowing to ENOENT only
- [x] Task 2: HMAC replay protection — signed timestamp + clock-skew window
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): 1 Important finding — scaffold-strip.ts's stripTsconfigPath twin was NOT narrowed to ENOENT-only like scaffold-auth-none.ts's was, inconsistent within the same branch. Fixed (187c175, mirrored the established pattern + new test). Re-review caught a SEPARATE process mistake in that fix commit: it accidentally included 4 files of the known tools/create-icore/templates/ build-artifact drift (a build run mid-task re-dirtied the tree after the initial discard). Reverted in 851c17a. Final state clean: no template drift in branch history, 188 tests green, lint clean.

DONE. Branch bug/error-handling-and-replay-protection-polish ready for PR --base dev.

Task 2: complete (commit 63f232f..f4af5be, review clean, 0 findings, no deviations). Security review confirmed: _ts included inside signed payload (tamper-evident), verification order correct (signature checked before freshness), symmetric clock-skew check (stale AND future both rejected), no bypass via missing/wrong-type _ts. 1 theoretical non-exploitable NaN edge case noted (not attacker-reachable, only legitimate signer ever sets _ts, always a real Date.now() number) — not fixed, correctly judged not worth it.

Task 1: complete (commits 1f2da72..73c6d2b..63f232f, review clean). Narrowing wire-provider.ts's catches surfaced a REAL pre-existing bug: scaffold-strip.ts's stripTsconfigPath left a dangling comma when the regex-removed tsconfig path entry was positionally LAST (no trailing comma on its own line to strip, so the preceding entry's comma dangles before `}` — invalid JSON), previously masked by the exact blanket catch this task was narrowing. Fixed inline (73c6d2b). Found + fixed a TWIN of this same bug in scaffold-auth-none.ts's independent duplicate stripTsconfigPath (used in a 4-alias removal loop for authProvider=none, arguably higher risk) — fixed in 63f232f with the same comma-cleanup + ENOENT narrowing + new regression test. Both fixes reviewed and confirmed sound via manual trace + TDD red/green verification.

Reminders (from memory):
- Any package.json dep edit → yarn install + commit yarn.lock (not expected needed here — pure logic changes).
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr8-execution-record/ and commit BEFORE opening the PR.
- Watch for tools/create-icore/templates/** stray drift — discard, don't commit.
- Multiple concurrent worktrees can exhaust the OS inotify watch limit ("failed to register initial watches") — retry with NX_DAEMON=false prefixed.
