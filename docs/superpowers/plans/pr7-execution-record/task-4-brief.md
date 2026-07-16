### Task 4: Changeset + build gate

**Files:**
- Create: `.changeset/pr7-mui-antd-oauth-gating.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix the same OAuth/magic-link gating gap PR4 closed for client-shadcn, now for client-mui and client-antd: LoginForm was rendering the Google/GitHub buttons and magic-link toggle unconditionally even though postgres/mongodb don't implement either. Also fixes a related generator bug found during this work — client-mui's and client-antd's .env.example files were missing the VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK placeholder lines entirely (only client-shadcn had them), so writeClientEnv's regex-replace silently never wrote either var for --ui=mui/--ui=antd scaffolds.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore client-mui client-antd` (adjust `build` to whatever target name Tasks 2/3 confirmed if `run-many -t build` doesn't resolve it — `nx run-many` matches by target name across projects, so if the real target is `vite:build`, use `npx nx run-many -t lint test vite:build -p create-icore client-mui client-antd` instead, or run `build`/`vite:build` per-project as needed).
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr7-mui-antd-oauth-gating.md
git commit -m "chore: add changeset for PR7 mui/antd OAuth gating fixes"
```

## Self-Review

- **Spec coverage:** the documented follow-up ("client-mui/client-antd have the identical OAuth-gating bug PR4 fixed for client-shadcn") is closed for both templates.
- **Placeholder scan:** none — every step has complete, runnable code, including the newly-discovered `.env.example` fix.
- **Type consistency:** both `LoginForm` components keep their existing `Props` interface (`onSwitchRegister`/`onSwitchMagicLink`) unchanged — only the two new module-level constants and JSX conditionals are additions.
- **Scope note:** the mixed-flag test cases are included in Tasks 2/3 from the start (learned from PR4, where task review had to catch this gap after the fact) — no separate fix-and-re-review cycle needed here for that specific class of gap.
- **Real bug found during planning:** the missing `.env.example` placeholders (Task 1) is not in the original follow-up list the user approved — it's a necessary prerequisite discovered while designing Tasks 2–3, without which the gating fix would silently misbehave. Documented above in the plan's "Found during planning" section, not silently folded in without explanation.
