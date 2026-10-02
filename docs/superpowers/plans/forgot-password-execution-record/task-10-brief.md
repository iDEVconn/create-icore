### Task 10: Runbook, CLI notice, docs, changeset, full verification, PR

**Files:**

- Modify: `docs/runbooks/auth-email-setup.md` (recovery sections), `tools/create-icore/src/lib/auth-email-notice.ts` + its test, `AGENTS.md`, `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-10-02-account-email-flows-design.md` (record the 4 plan rulings under the PR 2 section)
- Create: `.changeset/forgot-password.md`

- [ ] **Step 1: Failing test.** In `auth-email-notice.unit.test.ts` extend the Supabase case to also expect `'/reset-password'` and `'Reset Password'` (template name) in the text, and the Firebase case to expect `'Password reset'` and `'/reset-password'`.
- [ ] **Step 2: Run to fail** — `yarn nx test create-icore --testFile=auth-email-notice` → FAIL.
- [ ] **Step 3: Implement.** `authEmailNotice('supabase')` gains lines: `'  • Redirect URLs also: <CLIENT_ORIGIN>/reset-password'` and `'  • Email Templates → Reset Password: link to {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery'`; `authEmailNotice('firebase')` gains `'Firebase password reset: Authentication → Templates → Password reset → Customize action URL → <CLIENT_ORIGIN>/reset-password (without it Firebase resets on its own hosted page and /reset-password is never used).'`. In `docs/runbooks/auth-email-setup.md` replace the "Coming in the forgot-password PR" line with a full "Forgot password" section: flow (login link → `POST /auth/password/forgot` → email → `/reset-password?token_hash=…|oobCode=…` → `POST /auth/password/reset`), Supabase steps (Redirect URLs + Reset Password template with `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`), Firebase steps (custom action URL), behaviours (always-200, 400 `invalid_reset_token`, 400 `password_too_short`, all other sessions ended, postgres/mongodb unsupported → link hidden, `/reset-password` redirects to `/login`), troubleshooting. `AGENTS.md`: one bullet under Important describing the endpoints, the strategy-side revoke ordering (Firebase uid-wide) and `VITE_AUTH_HAS_PASSWORD_RESET`. `docs/architecture.md`: link the runbook section. Spec: add the four rulings. Changeset:

```md
---
'@idevconn/create-icore': minor
---

Forgot password for Supabase and Firebase: login-page link, in-app /reset-password, POST /auth/password/forgot (always 200) and /password/reset (ends all other sessions), new VITE_AUTH_HAS_PASSWORD_RESET flag; AuthStrategy gains requestPasswordReset/confirmPasswordReset (third-party implementers must add them)
```

- [ ] **Step 4: Full verification.** `yarn nx run-many -t lint build -p shared auth-supabase auth-firebase auth-postgres auth-mongodb auth auth-client api template-shared create-icore client-shadcn client-antd client-mui` (clients: `vite:build`), `yarn nx run-many -t test -p shared auth-supabase auth-firebase auth-postgres auth-mongodb auth auth-client api template-shared create-icore client-shadcn`, `node tools/create-icore/scripts/check-route-integrity.mjs`, then a scaffold smoke for a supabase combo and a postgres combo (`node tools/create-icore/scripts/smoke-scaffold.mjs --auth=supabase … --mode=link --projects=shared,auth,api` and `--auth=postgres …`) — both typecheck clean (postgres proves the stubs + hidden UI compile); `git checkout -- tools/create-icore/templates tools/create-icore/migrations/registry.json`; confirm `git branch --show-current` is `feature/forgot-password`; **do not `git add docs` wholesale** (an untracked `docs/live-testing-supabase-accounts.md` belongs to the user — add explicit paths only).
- [ ] **Step 5: Commit, push, PR** — `git add` explicit paths; commit `docs: forgot-password runbook, CLI notice, changeset`; `gh pr list --state all --limit 10`; `git push -u origin feature/forgot-password`; `gh pr create --base dev` with a body covering what/why/rulings/test plan and the Claude Code attribution line. Report CI; **do not merge**.
