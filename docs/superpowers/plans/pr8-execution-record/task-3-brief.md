### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr8-error-handling-and-replay-protection-polish.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Two polish fixes flagged Minor in prior reviews: (1) wire-provider.ts's mergeJsonDeps/stripJsonKeys/stripTsconfigKeys now only swallow ENOENT (file legitimately absent in partial fixtures) instead of every error, so a malformed JSON or write failure surfaces instead of silently reproducing a missing-dep bug; (2) the auth MS's opt-in HMAC transport guard now includes a signed timestamp with a 30s clock-skew tolerance, so a captured valid signed request can no longer be replayed indefinitely — only within that window. Changes the wire format of signed TCP payloads (adds _ts alongside _sig); safe since gateway and auth MS are always scaffolded and deployed together.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore shared auth auth-client`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr8-error-handling-and-replay-protection-polish.md
git commit -m "chore: add changeset for PR8 error-handling and replay-protection polish"
```

## Self-Review

- **Spec coverage:** both Minor findings the user flagged (`mergeJsonDeps` broad error-swallowing, no HMAC replay protection) are closed.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `isEnoent(err: unknown): boolean` is a plain new helper, no signature changes to any existing exported function. `HmacAuthGuard.canActivate` keeps its existing `(context: ExecutionContext): boolean` signature. `AuthClientService.send<T>` keeps its existing `(pattern: string, payload: object): Observable<T>` signature.
- **Consistency across the 3 wire-provider.ts functions:** all three get the identical ENOENT-narrowing treatment, not just `mergeJsonDeps` (the one originally flagged) — avoids leaving `stripJsonKeys`/`stripTsconfigKeys` inconsistent with their sibling.
