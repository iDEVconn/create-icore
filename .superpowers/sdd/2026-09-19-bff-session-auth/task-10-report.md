# Task 10 report — changeset, regression check, runbook, AGENTS.md, PR

Status: DONE_WITH_CONCERNS (minor, environment-only — see below)

## 1. Smoke suite run

Command: `yarn nx e2e client-shadcn-e2e` (full run, all 3 browser projects), then
`yarn nx e2e client-shadcn-e2e -- --project=chromium` (clean targeted rerun).

Full run result: 4 passed (Chromium), 8 failed (Firefox ×4, WebKit ×4) — all 8
failures are `browserType.launch: Executable doesn't exist at
.../firefox-.../pw_run.sh` / `.../webkit-.../pw_run.sh`, i.e. those browser
binaries are not installed in this sandbox (`yarn playwright install` was
never run for firefox/webkit here). Not related to the BFF change.

Targeted Chromium-only rerun: **4 passed in 1.6s**, clean.

Concern investigated per the task brief: Task 8 rewrote
`apps/templates/client-shadcn/src/app/auth-bootstrap.tsx` to call
`GET /auth/session` on every mount instead of a synchronous local check. In
this e2e config there is no gateway running, so the fetch goes through Vite's
dev proxy to `http://localhost:3001` and gets `ECONNREFUSED` immediately
(visible in the vite log: `http proxy error: /api/auth/session — Error:
connect ECONNREFUSED 127.0.0.1:3001`). `AuthBootstrap`'s `catch` branch treats
any failure (401, 503, or a hard connection refusal) as logged-out and calls
`setBooted(true)` right away — there is no timeout to wait out. The
"protected route redirects to login when unauthenticated" and "profile route
redirects to login" assertions both resolved promptly, no hang observed. This
is not a bug — no fix needed, no scope creep.

The only failures observed (Firefox/WebKit missing binaries) are a pre-existing
environment gap unrelated to this branch's changes, not a regression from
Task 8's auth-bootstrap rewrite. Flagging as DONE_WITH_CONCERNS only because a
full 3-browser green run wasn't achievable in this sandbox — not because
anything about the BFF change is suspect.

## 2. Changeset

Created `.changeset/bff-session-auth.md`:

```markdown
---
'@idevconn/create-icore': minor
---

Replaces the hybrid Bearer-access-token + httpOnly-refresh-cookie auth
model with a full BFF (Backend-For-Frontend) pattern: the browser now
holds only an opaque, httpOnly `icore_sid` session cookie. The gateway
resolves identity from a new Redis-backed `SessionStore`, transparently
refreshing the underlying provider (Supabase/Firebase/MongoDB/Postgres)
token pair server-side under a distributed lock. CSRF protection is now a
global guard covering every mutating route, not just `/auth/refresh`.
Requires a new `SESSION_REDIS_URL` env var on the gateway. Breaking change:
every existing session is invalidated on deploy (forced re-login).
```

Verified format against `.changeset/config.json` and prior changesets
(`git log --all --oneline -- .changeset/`, e.g. `b434707` "chore: add
changeset for httpOnly cookie auth fix") — matches this repo's convention
exactly (single package, `minor` bump, no changelog category needed).

## 3. Runbook

Created `docs/runbooks/bff-session-auth-migration.md` (full text committed;
see file). Read `docs/runbooks/local-docker.md` and
`docs/runbooks/third-party-infra-audit-fixes.md` first to match style
(problem/solution framing, PR/file references, tables where useful, terse
prose elsewhere). Sections: What changed and why (links spec + plan docs),
new `SESSION_REDIS_URL` requirement (contrasted with optional
`AUTH_REDIS_URL`, and the fail-fast-no-fallback behavior verified by reading
`apps/api/src/app/session/session-store.provider.ts`), forced-relogin-on-
deploy consequence, rollback note (ephemeral Redis state, no durable-store
migration), the 3 known gaps (client-antd/mui OAuth, no live burst-concurrency
verification, no full-stack e2e), and the regression-check summary from item 1.

## 4. AGENTS.md update

Added one bullet to `## Important` (after the `MongoDbDBStrategy.getModel()`
bullet, i.e. the last one in that section, around line 320):

> Auth is now a full BFF (Backend-For-Frontend) session model: the browser
> holds only an opaque, httpOnly `icore_sid` cookie, never a provider token.
> The gateway resolves identity via a Redis-backed `SessionStore` (requires
> `SESSION_REDIS_URL`, no in-memory fallback — boot fails fast without it)
> and refreshes the underlying provider token pair server-side under a
> distributed lock. The global `CsrfGuard` now covers every mutating route,
> not just auth — send `X-CSRF-Token` on every non-GET request. See
> `docs/runbooks/bff-session-auth-migration.md` for the env var,
> forced-relogin-on-deploy consequence, and known gaps.

`npx prettier --write` run on all 3 touched files — all reported "unchanged"
(already formatted correctly).

## 5. `gh pr list` output before acting

Ran twice (once before committing, once immediately before pushing, per the
repo's mandatory workflow rule). Both times: no PR existed for
`feature/bff-session-auth`, and nothing relevant was open — the 10 most
recent PRs (#319–#328) are all already MERGED (auto-sync/version-packages/
unrelated bug-fix PRs). No conflict, no duplicate.

## Commit

`c5458b0` — "docs: changeset + runbook for BFF session auth migration"
(3 files changed: `.changeset/bff-session-auth.md`,
`docs/runbooks/bff-session-auth-migration.md`, `AGENTS.md`).

Note: `docs/live-testing-supabase-accounts.md` was present as an untracked
file at the start of this task (pre-existing, not created by this task) and
was deliberately left out of the commit — it's outside this task's stated
file scope.

## PR

Pushed `feature/bff-session-auth` to `origin` (26 commits ahead of
`origin/dev` plus this docs commit). Opened:

**https://github.com/iDEVconn/create-icore/pull/329**

Base: `dev` (confirmed `--base dev` used). Title: "feat: BFF server-side
session auth (opaque cookie, no client-visible tokens)". Body covers what
changed (with links to spec/plan/runbook), the breaking-change/forced-relogin
note, the new `SESSION_REDIS_URL` env var, rollback note, the same 3 known
gaps as the runbook, and the test plan (smoke suite result). Ends with the
required Claude Code attribution line.

CI status at time of report: "Detect affected projects" check is
IN_PROGRESS/pending — opened only moments before checking, so most of the
pipeline hasn't started yet. Did not wait for full CI completion per task
instructions.

**Did not merge the PR** — stopped after opening it, per AGENTS.md's mandatory
no-autonomous-merge rule.

## Issues / concerns

- Firefox/WebKit Playwright browser binaries aren't installed in this sandbox,
  so the smoke suite could only be fully verified on Chromium. The Chromium
  run is clean and directly answers the concern the task raised (bootstrap's
  network-dependent behavior resolves promptly, no hang). Recommend running
  `yarn playwright install` and re-running the full 3-browser suite in CI or
  a properly provisioned dev box if cross-browser confidence is wanted beyond
  what CI's own Playwright job already provides.
- No other blockers. Changeset/runbook/AGENTS.md conventions were unambiguous
  once compared against existing examples — no need to escalate a question.
