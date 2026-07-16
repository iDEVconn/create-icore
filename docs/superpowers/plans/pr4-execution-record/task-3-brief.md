### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr4-shadcn-ui-gaps.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two shadcn client UI gaps: LoginForm now gates the OAuth buttons and magic-link toggle behind VITE_AUTH_HAS_OAUTH/VITE_AUTH_HAS_MAGIC_LINK (written by the generator based on --auth=<provider>) instead of always rendering them, since postgres and mongodb don't implement either and clicking guaranteed a request failure; globals.css now defines the --color-popover and --color-accent tokens that dropdown-menu.tsx and dialog.tsx already reference, which previously compiled to a no-op (transparent background) since the tokens didn't exist.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore client-shadcn`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr4-shadcn-ui-gaps.md
git commit -m "chore: add changeset for PR4 shadcn UI gap fixes"
```

## Self-Review

- **Spec coverage:** Gap #7 (OAuth/magic-link UI shown unconditionally) → Task 1. Gap #8 (dead shadcn tokens) → Task 2. Both closed for the shadcn template.
- **Placeholder scan:** none. Task 1 has a real automated RTL test (client-shadcn does have a working test harness — corrected from an earlier draft's mistaken claim otherwise). Task 2's "manual check" steps are explicit, numbered, and give a concrete pass/fail criterion since JSDOM can't observe real computed CSS custom-property values.
- **Type consistency:** `writeClientEnv`'s new `opts: CreateIcoreOptions` parameter matches every other `write*Env` function in `scaffold-env.ts` (`writeAuthEnv`, `writeUploadEnv`, etc. already take `opts`).
- **Scope note:** `client-mui` and `client-antd` have the *identical* gap — both `LoginForm.tsx` files render unconditional Google/GitHub buttons and a magic-link switch (confirmed via grep: `client-mui/.../LoginForm.tsx` and `client-antd/.../LoginForm.tsx` both reference `GoogleIcon`/`GithubOutlined`/`onSwitchMagicLink`). This PR deliberately fixes only `client-shadcn`, matching the original audit's blueprint scope (`ui=shadcn`). Fixing `client-mui`/`client-antd` the same way is a natural, low-risk follow-up — not silently dropped, just out of this PR's stated scope.
