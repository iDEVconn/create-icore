# Progress Ledger — PR6: supabase-firebase-revoke

Branch: feature/supabase-firebase-revoke (worktree: .claude/worktrees/feature+supabase-firebase-revoke)
Base: dev @ 95399fb (includes PR1-5, all merged)
Plan: docs/superpowers/plans/2026-07-15-pr6-supabase-firebase-revoke.md
Design spec: docs/superpowers/specs/2026-07-15-supabase-firebase-revoke-design.md (approved)

## Tasks
- [x] Task 1: Supabase revoke() + revokeIsUserWide contract-test flag infrastructure
- [x] Task 2: Firebase revoke() — uid-wide revocation
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): Ready to merge, 0 Critical/Important, 2 Minor (stale supportsRevoke JSDoc examples now that both providers support revoke — supportsRevoke:false branch is dead code, no call site uses it anymore; blanket catch{} can't distinguish "token already dead" from "revocation call itself failed" — consistent with existing postgres/mongodb behavior, not fixed).

DONE. Branch feature/supabase-firebase-revoke ready for PR --base dev.

Task 2: complete (commit 2369889..d8bd5a0, review clean, 0 findings, no deviations needed — uid-based design from planning held up cleanly, unlike Task 1's token-based mock which needed a TDD-discovered fix). Reviewer traced the full mock sequence confirming revokeRefreshTokens(uid) genuinely fires and a separate live session for the same user correctly rejects afterward. Contract flipped to revokeIsUserWide:true, confirmed correct branch fires. Only other FirebaseAdminAuthLike implementer (real firebase-admin Auth object) natively has revokeRefreshTokens — no breakage.

Task 1: complete (commit 321010c..2369889, review clean, 0 findings). Real design bug in the brief's own Step 2 found+fixed via TDD: revoke() rotates the token via refreshSession() before signOut, so a literal Set<string> of signed-out tokens never catches the ORIGINAL access token (only the post-rotation one). Fixed by tracking session identity (sessionId persisting across rotation, mirroring real Supabase JWT session_id claims) instead of literal token equality. Reviewer independently traced the mock code end-to-end and confirmed: rotation claim true, sessionId fix sound, session independence preserved (separate signIn/signUp calls get distinct sessionIds), well-scoped (mock-internals only, no scope creep).

Reminders (from memory):
- Any package.json dep edit → yarn install + commit yarn.lock.
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr6-execution-record/ and commit BEFORE opening the PR.
- Watch for tools/create-icore/templates/** stray drift after running nx build/smoke scripts — discard, don't commit.
