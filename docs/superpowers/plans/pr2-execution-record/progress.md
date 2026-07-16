# Progress Ledger — PR2: rpc-boundary-hygiene

Branch: bug/auth-rpc-boundary-hygiene (worktree: .claude/worktrees/bug+auth-rpc-boundary-hygiene)
Base: dev @ d3531e7 (includes PR1's merge, PR #238)
Plan: docs/superpowers/plans/2026-07-14-pr2-rpc-boundary-hygiene.md

## Tasks
- [x] Task 1: setRole/sendMagicLink stop returning bare void
- [x] Task 2: PostgresAuthStrategy domain errors survive TCP hop as RpcException
- [x] Task 3: Changeset + build gate

ALL 3 TASKS COMPLETE. Final whole-branch review (opus): Ready to merge, 0 Critical/Important, 2 Minor (both pre-noted, no fix needed).

DONE. Branch bug/auth-rpc-boundary-hygiene ready for PR --base dev.
PR #239 opened: https://github.com/iDEVconn/create-icore/pull/239. CI running as of push. Waiting for green — no autonomous merge.

Task 1: complete (commits 398a375..71ffd75, review clean, 0 findings). Implementer also added ignoredFiles globs to libs/auth-client/eslint.config.mjs's @nx/dependency-checks rule — necessary since this was auth-client's first test file; reviewer confirmed matches precedent in libs/firebase-admin/eslint.config.mjs.
Task 2: complete (commits 71ffd75..4e78435, review clean, 2 Minor findings — no fix needed: (1) diff dropped Task 1's explanatory comment above setRole/sendMagicLink when copying brief's Step 6 snippet verbatim, harmless doc regression; (2) RPC error mapping tests mock a raw RpcException instance rather than the plain {status,message} object a real TCP round-trip produces — reviewer verified this doesn't affect correctness since RpcException.message duck-types identically, gap inherited from the plan's own brief not the implementer).
