# Progress Ledger — PR3: auth-ms-security

Branch: feature/auth-ms-hmac-and-revoke (worktree: .claude/worktrees/feature+auth-ms-hmac-and-revoke)
Base: dev @ 0a8c79b (includes PR1 #238, PR2 #239, docs archive #240)
Plan: docs/superpowers/plans/2026-07-14-pr3-auth-ms-security.md (already committed on dev via #240)

## Tasks
- [x] Task 1: HMAC transport guard on the auth MS
- [x] Task 2: Session revocation (revoke/logout)
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): Ready to merge. 1 Important finding (fixed in 7a8e203): .env.example comments claimed AUTH_TCP_SECRET missing is a "no-op (open, as before)" unconditionally — actually only true outside production; in production it causes 100% runtime request rejection (not boot crash), making the secret effectively required before prod deploy. Also fixed hmac.guard.ts's own doc comment (said "crashes boot," actually per-request runtime rejection) and clarified the secret must match exactly on both apps/api/.env and apps/microservices/auth/.env. 2 Minor (not fixed, correctly out of scope): no replay protection (nonce/timestamp) — threat-model-limited, noted for a future task if it matters.

DONE. Branch feature/auth-ms-hmac-and-revoke ready for PR --base dev.

Task 2: complete (commit 468de22..65299fe, review clean, 0 findings). Real gap the plan missed, caught+fixed by implementer: supabase/firebase's OWN contract-test suites also call runAuthContract(), and the brief's new revoke tests were unconditional — would've broken those two providers' contracts since they intentionally throw not_implemented for revoke(). Fix: added opt-out `supportsRevoke` flag to runAuthContract's helpers param (mirrors existing getOAuthCode pattern); supabase/firebase call sites pass supportsRevoke:false. Reviewer independently verified the mechanism is sound (not a silent skip — asserts not_implemented behavior) and judged it the correct fix, not a shortcut. All 8 touched/affected projects green (shared/auth/auth-client/auth-postgres/api/auth-mongodb/auth-supabase/auth-firebase).

Task 1: complete (commit 0a8c79b..468de22, review clean, 0 findings — thorough security review: timing-safe compare verified, guard correctly strips _sig before handler sees payload, dev/prod no-secret paths verified, no bypass found. Noted residual: no replay protection, explicitly out of scope for this task).

Reminders (from memory, learned during PR1/PR2):
- Any package.json dep edit → yarn install + commit yarn.lock, or CI --immutable breaks.
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr3-execution-record/ and commit BEFORE opening the PR, not after being asked.
