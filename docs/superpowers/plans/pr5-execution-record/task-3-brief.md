### Task 3: Changeset + build gate

**Files:**
- Create: `.changeset/pr5-dependency-plumbing.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
"@idevconn/create-icore": patch
---

Fix two dependency-wiring gaps: the root package.json's @types/bcrypt + @types/jsonwebtoken pnpm-hoisting workaround now also applies to authProvider=postgres (previously mongodb-only, even though the postgres strategy imports the same two packages); writeProvider() now merges the chosen auth/storage/db provider's own workspace alias + raw deps into the microservice's package.json instead of only ever removing the unchosen providers' entries — previously a fresh postgres (or any non-hardcoded-default) generation had zero declared dependency on its own provider package, working only by yarn's node_modules hoisting and breaking under pnpm/npm's stricter isolation.
```

- [ ] **Step 2: Full build gate**

Run: `npx nx run-many -t lint test build -p create-icore`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/pr5-dependency-plumbing.md
git commit -m "chore: add changeset for PR5 dependency plumbing fixes"
```

## Self-Review

- **Spec coverage:** Gap #9 (pnpm devDep fix mongodb-only) → Task 1. Gap #10 (provider deps never propagated to msPackageJson) → Task 2. Both closed generically — Task 2 fixes all 3 axes (auth/storage/db) since they share `writeProvider()`.
- **Placeholder scan:** none.
- **Type consistency:** `mergeJsonDeps(path: string, deps: Record<string, string>): Promise<void>` mirrors `stripJsonKeys`'s signature shape (path + predicate/data, `Promise<void>`), consistent with the file's existing helper style.
- **Dead-code note:** `mergeDeps()` in `assemble.ts` existed and was unit-tested but had zero callers outside its own test file before this change — Task 2 gives it its first real caller instead of leaving it dead, closing a small "Clean Code" gap alongside the functional fix.
