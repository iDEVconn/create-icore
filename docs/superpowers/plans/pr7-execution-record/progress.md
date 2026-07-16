# Progress Ledger — PR7: mui-antd-oauth-gating

Branch: bug/mui-antd-oauth-gating (worktree: .claude/worktrees/bug+mui-antd-oauth-gating)
Base: dev @ 95399fb (includes PR1-5, all merged; independent of PR6, cut from same base)
Plan: docs/superpowers/plans/2026-07-15-pr7-mui-antd-oauth-gating.md

## Tasks
- [x] Task 1: Fix missing VITE_AUTH_HAS_* placeholders in mui/antd .env.example
- [x] Task 2: Gate client-mui's LoginForm
- [x] Task 3: Gate client-antd's LoginForm
- [x] Task 4: Changeset + build gate

ALL 4 TASKS COMPLETE. Final whole-branch review (opus): Ready to merge, 0 Critical/Important, 1 pre-existing Minor (antd Space 'direction' deprecation warning, predates this PR, not touched by it). Confirmed cross-template consistency (shadcn/mui/antd all gate identically, no coupling), .env.example fix genuinely complete for all 3 templates, interrupted Task 2's file re-verified clean (no JSX/import issues from the resume), matchMedia polyfill correctly scoped, no shadcn files touched (no duplication/conflict with its earlier fix).

DONE. Branch bug/mui-antd-oauth-gating ready for PR --base dev.

Task 3: complete (commit d7e9bee..15c5d53, review clean, 0 findings). Deviation: added a window.matchMedia jsdom polyfill localized to LoginForm.spec.tsx's beforeAll (antd's Space/Grid components crash under jsdom without it — known jsdom limitation, jsdom doesn't implement matchMedia). Reviewer empirically reproduced the crash by stripping the polyfill and rerunning, confirmed identical stack trace, restored file after. Scoping confirmed correct (no shared setup file touched). Noted as a fast-follow candidate to promote to a shared vite-plugins setupFiles config once a second antd-responsive test exists — not needed for this task.

Task 2: complete (commit 764ae28..d7e9bee, review clean, 0 findings). Implementer subagent was interrupted mid-response by an API/connection error right after committing — resumed via SendMessage, asked to re-verify its own work before writing the report. Reviewer treated the report with extra scrutiny per instruction and independently re-ran everything fresh (non-cached): 6/6 tests, lint clean, vite:build green, no half-written files/debug code/TODOs. Confirmed sound despite the interruption.

Task 1: complete (commit fdf7bc5..764ae28, review clean, 0 findings). Byte-diffed all 3 .env.example blocks confirmed identical; reviewer verified against the pre-fix commit that the test genuinely fails before/passes after for the right reason.

Reminders (from memory):
- Any package.json dep edit → yarn install + commit yarn.lock.
- Archive .superpowers/sdd/*.md into docs/superpowers/plans/pr7-execution-record/ and commit BEFORE opening the PR.
- Watch for tools/create-icore/templates/** stray drift — discard, don't commit.
- IMPORTANT (new this session): multiple worktrees open concurrently can exhaust the OS inotify watch limit ("failed to register initial watches"). If `nx test`/`nx run` fails with this error, retry with `NX_DAEMON=false` prefixed.
- LoginForm.tsx in mui/antd imports `api` from `@/main` and calls `useNavigate()` at module/render scope — real main.tsx has side effects (createRoot().render(), createRouter()) that WILL break tests unless `@/main` and `@tanstack/react-router` are mocked (unlike client-shadcn's props-based LoginForm, which needed no mocking).
