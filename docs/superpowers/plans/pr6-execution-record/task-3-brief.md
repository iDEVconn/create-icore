### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr6-supabase-firebase-revoke.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Implement AuthStrategy.revoke() for supabase and firebase (previously not_implemented stubs from PR3). Supabase: exchanges the refresh token via refreshSession() then calls admin.signOut(accessToken, 'local'), ending exactly that one session. Firebase: exchanges via identityToolkit.refresh() + verifyIdToken() to derive the uid, then calls adminAuth.revokeRefreshTokens(uid) — Firebase has no per-session revoke primitive, so this ends every session for that user (documented SDK limitation, covered by a dedicated contract-test variant rather than silently treated as equivalent to per-session revoke). The shared AuthStrategy contract gains a revokeIsUserWide flag so both revoke shapes are correctly tested.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p shared auth-supabase auth-firebase`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr6-supabase-firebase-revoke.md
git commit -m "chore: add changeset for PR6 supabase/firebase revoke implementation"
```

## Self-Review

- **Spec coverage:** Both providers' `not_implemented` stubs replaced with real implementations per the approved design spec.
- **Placeholder scan:** none — every step has complete, runnable code including the mock extensions.
- **Type consistency:** `FirebaseAdminAuthLike.revokeRefreshTokens(uid: string): Promise<void>` matches the real `firebase-admin` signature exactly (verified against `node_modules/firebase-admin/lib/auth/base-auth.d.ts:321`). `AuthContractHelpers.revokeIsUserWide?: boolean` is additive, doesn't change any existing call site's behavior (all default to `undefined`/falsy).
- **Gameable-test risk closed:** both tasks add a dedicated unit test specifically proving the real revocation call fires (not just that the exchange step's token-rotation side effect masks a no-op revoke) — this was found during planning, not part of the original approved spec text, and is the reason this plan has more test surface than the spec's "reuse the shared contract" note implied.
