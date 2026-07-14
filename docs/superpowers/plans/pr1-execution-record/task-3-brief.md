### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr1-role-jwt-refresh-contract.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two auth contract gaps in generated projects: the auth MS now re-mints the session after assigning a user's initial role, so the first JWT a client receives already carries it (previously only visible after the next login/refresh); the client's create-api.ts now overrides @idevconn/api-client's snake_case token-field defaults to match the gateway's camelCase AuthSession contract, so automatic token refresh actually works instead of silently no-op'ing and force-logging-out users at JWT_EXPIRES_IN.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p auth template-shared`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr1-role-jwt-refresh-contract.md
git commit -m "chore: add changeset for PR1 role/refresh-contract fixes"
```

## Self-Review

- **Spec coverage:** Gap #1 (JWT drops role) → Task 1. Gap #2 (refresh-token field mismatch) → Task 2. Both closed.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `AuthController.signup/verifyMagicLink/completeOAuth` keep `Promise<AuthSession>`; `createIcoreApi` keeps its existing signature. No cross-task signature drift.
