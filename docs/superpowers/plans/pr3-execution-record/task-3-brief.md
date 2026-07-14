### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr3-auth-ms-security.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Close two auth MS security gaps: add an opt-in HMAC transport guard (AUTH_TCP_SECRET) so the auth MS's TCP port rejects unsigned requests once configured, closing an admin-role-escalation hole where any process reaching the port could call auth.setRole directly; add AuthStrategy.revoke() (postgres/mongodb/fake implemented, supabase/firebase throw not_implemented pending their own session-tracking design) wired to a new POST /auth/logout route, so a leaked or stolen refresh token — or a shared-machine logout — can actually end that session instead of living until its natural 7-day expiry.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p shared auth auth-client auth-postgres api`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr3-auth-ms-security.md
git commit -m "chore: add changeset for PR3 auth MS security fixes"
```

## Self-Review

- **Spec coverage:** Gap #5 (zero transport auth on the auth MS TCP port) → Task 1. Gap #6 (no revoke/logout) → Task 2. Both closed for the postgres blueprint; mongodb gets the same fix as a side effect since it shares the interface.
- **Placeholder scan:** none — supabase/firebase's `not_implemented` stubs are an explicit, disclosed scope boundary (see Task 2's "Scope decision"), not a placeholder standing in for missing work.
- **Type consistency:** `AuthStrategy.revoke(refreshToken: string): Promise<void>` is identical across all 5 implementations (`postgres`, `mongodb`, `fake`, and the two stubs). `AuthClientService.revoke` mirrors `setRole`'s `Promise<void>`-wrapping-`{ok:true}` pattern from PR2.
