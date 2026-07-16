### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr2-rpc-boundary-hygiene.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two TCP RPC boundary bugs in the generated auth stack: auth.setRole/auth.magicLink.send now return {ok:true} instead of bare void (an empty TCP response crashes the gateway's firstValueFrom() with "no elements in sequence"), and PostgresAuthStrategy now throws RpcException instead of plain Error so domain error codes (invalid_credentials, user_already_exists, invalid_refresh_token) survive the TCP hop and map to the correct HTTP status at the gateway instead of a generic 500.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p auth auth-client auth-postgres`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr2-rpc-boundary-hygiene.md
git commit -m "chore: add changeset for PR2 RPC boundary hygiene fixes"
```

## Self-Review

- **Spec coverage:** Gap #3 (void handlers) → Task 1. Gap #4 (plain Error across RPC) → Task 2. Both closed for the postgres blueprint.
- **Placeholder scan:** none.
- **Type consistency:** `AuthController.setRole`/`.sendMagicLink` → `Promise<{ ok: true }>`; `AuthClientService.setRole`/`.sendMagicLink` keep external `Promise<void>`. `mapRpcErrors<T>` is generic over the wrapped promise's resolved type, used identically in `login`/`signup`/`refresh`.
- **Scope note:** Mongodb/Firebase/Supabase strategies still throw plain `Error` — out of scope for this PR (postgres blueprint only, per the original audit request). Filed as a natural follow-up, not silently dropped.
