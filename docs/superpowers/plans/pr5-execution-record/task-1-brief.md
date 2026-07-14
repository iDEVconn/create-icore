### Task 1: Root pnpm devDep workaround covers postgres too

**Files:**
- Modify: `tools/create-icore/src/lib/scaffold-env.ts:148-152`
- Modify: `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts` (extend the existing `describe('rewriteRootPackageJson — mongodb deps')` block)

**Root cause:** `PostgresAuthStrategy` imports `bcrypt` and `jsonwebtoken` (`postgres-auth.strategy.ts:2-3`) exactly like `MongoDbAuthStrategy` does, but `rewriteRootPackageJson()`'s guard for adding `@types/bcrypt`/`@types/jsonwebtoken` to the root `devDependencies` only checks `opts.authProvider === 'mongodb'`. Under pnpm's strict node_modules isolation, `nx build` (which runs from the workspace root) can't resolve these two `@types/*` packages for a postgres project — they're devDeps of `libs/auth-strategies/postgres`, not hoisted to root.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
// Add inside describe('rewriteRootPackageJson — mongodb deps'), after the
// existing 'adds @types/bcrypt and @types/jsonwebtoken ... mongodb' test:
  it('adds @types/bcrypt and @types/jsonwebtoken to devDeps when authProvider=postgres', async () => {
    const pkg = await run({ authProvider: 'postgres', dbProvider: 'none', upload: 'none' });
    expect(pkg.devDependencies['@types/bcrypt']).toBeDefined();
    expect(pkg.devDependencies['@types/jsonwebtoken']).toBeDefined();
  });

  it('does not add @types/bcrypt when neither auth provider needs it', async () => {
    const pkg = await run({
      authProvider: 'supabase',
      dbProvider: 'postgres',
      upload: 'cloudinary',
    });
    expect(pkg.devDependencies['@types/bcrypt']).toBeUndefined();
    expect(pkg.devDependencies['@types/jsonwebtoken']).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- scaffold.unit.test.ts -t "authProvider=postgres"`
Expected: FAIL — the first new test's `devDependencies['@types/bcrypt']` is `undefined`.

- [ ] **Step 3: Widen the condition**

```typescript
// tools/create-icore/src/lib/scaffold-env.ts
  // @types/bcrypt and @types/jsonwebtoken are devDeps of the postgres/mongodb
  // auth-strategy libs, but pnpm strict isolation does not hoist them to root
  // node_modules — TypeScript can't find them during nx build, which runs
  // from root. Add to root devDependencies when either provider is chosen.
  if (opts.authProvider === 'mongodb' || opts.authProvider === 'postgres') {
    const devDeps = (pkg['devDependencies'] ??= {}) as Record<string, string>;
    devDeps['@types/bcrypt'] = '^6.0.0';
    devDeps['@types/jsonwebtoken'] = '^9.0.10';
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- scaffold.unit.test.ts -t "@types/bcrypt"`
Expected: PASS — all 4 cases in the extended `describe` block (mongodb, postgres, upload-only-mongodb, dbProvider-only-mongodb) pass.

- [ ] **Step 5: Run the full create-icore suite to confirm no regression**

Run: `npx nx test create-icore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
npx nx lint create-icore
git add tools/create-icore/src/lib/scaffold-env.ts tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts
git commit -m "fix(scaffold): add @types/bcrypt + @types/jsonwebtoken root devDeps for authProvider=postgres"
```

---

