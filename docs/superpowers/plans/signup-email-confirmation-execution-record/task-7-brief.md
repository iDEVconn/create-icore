### Task 7: Spec sync, docs, changeset, full verification, PR

**Files:**

- Modify: `docs/superpowers/specs/2026-10-02-account-email-flows-design.md` (contract section: replace the `SignUpResult` union with `EmailConfirmationRequiredError` + `SignUpConfirmationRequired`, note the reason)
- Modify: `docs/architecture.md`, `AGENTS.md` (one bullet: signup may be `confirmation_required`/202; `CLIENT_ORIGIN` drives email links; link the runbook)
- Create: `.changeset/signup-email-confirmation.md`

- [ ] **Step 1:** Edit the spec and docs as above. Changeset:

```md
---
'@idevconn/create-icore': patch
---

Signup with Supabase "Confirm email" no longer 500s: gateway answers 202 confirmation_required, clients show the check-email screen, emails link to CLIENT_ORIGIN, unconfirmed login is a clear 403; CLI prints the Supabase/Firebase URL setup notice
```

- [ ] **Step 2: Full verification** — `yarn nx affected -t lint test build` (or `yarn nx run-many -t lint test -p shared auth-supabase auth auth-client api template-shared client-shadcn client-antd client-mui create-icore`), `node tools/create-icore/scripts/check-route-integrity.mjs`, `git status` (discard `templates/`/`registry.json` drift), confirm `git branch --show-current` = `bug/signup-email-confirmation`.

- [ ] **Step 3: Commit, push, PR**

```bash
npx prettier --write docs/superpowers/specs/2026-10-02-account-email-flows-design.md docs/architecture.md AGENTS.md .changeset/signup-email-confirmation.md
git add docs AGENTS.md .changeset/signup-email-confirmation.md
git commit -m "docs: signup email confirmation — spec sync, architecture, changeset

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
gh pr list --state all --limit 10
git push -u origin bug/signup-email-confirmation
gh pr create --base dev --title "fix: signup email confirmation (202), CLIENT_ORIGIN email links, unconfirmed login 403" --body "<what/why/test plan; end with the Claude Code attribution line>"
```

Report CI result + PR link. **Do not merge.**
