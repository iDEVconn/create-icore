# PR5: Dependency plumbing — pnpm root devDep + provider dep propagation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two dependency-wiring gaps in `tools/create-icore` for the `authProvider=postgres` blueprint: (1) the root `package.json`'s pnpm-hoisting workaround for `@types/bcrypt`/`@types/jsonwebtoken` only fires for `authProvider=mongodb`, even though `postgres` imports the exact same two packages; (2) `writeProvider()` (the function that wires the chosen auth/storage/db provider) writes the `<axis>.provider.ts` import stub but never merges that provider's own dependencies into the microservice's `package.json` — the generated `apps/microservices/auth/package.json` never gets `@icore/auth-postgres`, `postgres`, `bcrypt`, or `jsonwebtoken` at all. This works today only because yarn's flat `node_modules` hoists them from `libs/auth-strategies/postgres/package.json`'s own deps; it breaks under pnpm/npm's stricter isolation, and is wrong regardless of package manager (the MS's own manifest doesn't declare what it actually imports).

**Architecture:** Gap 1 is a one-line condition widening. Gap 2 is a root-cause fix in the single shared `writeProvider()` helper (`libs/auth-strategies/*`, `libs/storage-strategies/*`, and `libs/db-strategies/*` all funnel through it via `wire-auth.ts`/`wire-storage.ts`/`wire-db.ts`), which also revives `mergeDeps()` in `assemble.ts` — a function that was written and unit-tested but never wired into the actual scaffold pipeline (confirmed dead code: zero callers outside its own test file before this change).

**Tech Stack:** Node.js `fs/promises`, Vitest.

## Global Constraints

- Nx monorepo — run tests via `nx test <project>`.
- TDD: failing test first.
- `npx prettier --write <touched files>` before every commit.
- `nx lint <project>` 0 errors, `nx build <project>` green before commit.
- Every PR needs a `.changeset/<slug>.md`, `patch` bump.
- Branch: `bug/postgres-dep-plumbing` cut from `dev`. PR base `dev`.
- Touched project: `create-icore` (generator only — no template files change).
- This fix is shared infrastructure (`writeProvider` is used by the auth, storage, and db axes alike), so Task 2 benefits `mongodb`/`supabase`/`firebase`/`cloudinary` blueprints too, not just postgres — verify existing tests for all axes still pass, since the change is generic.

---

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

### Task 2: `writeProvider()` merges the chosen provider's own deps into the microservice's package.json

**Files:**
- Modify: `tools/create-icore/src/manifest/wire-provider.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`

**Interfaces:**
- Consumes: `mergeDeps(units: Unit[]): Record<string, string>` from `assemble.ts` (existing, previously unused outside its own test).
- Produces: `mergeJsonDeps(path: string, deps: Record<string, string>): Promise<void>` (new, exported alongside `stripJsonKeys`/`stripTsconfigKeys`).

**Root cause:** `writeProvider()` only ever writes the `<axis>.provider.ts` wiring stub. The microservice's static `package.json` template hardcodes deps for whichever providers happened to be baked into the initial scaffold (`apps/microservices/auth/package.json` currently lists `@icore/auth-firebase`/`@icore/auth-supabase`/`@supabase/supabase-js` but has no `@icore/auth-postgres`/`postgres`/`bcrypt`/`jsonwebtoken` entries at all). `cleanupUnusedAxis()` only ever *removes* keys for the providers that weren't chosen — it never adds anything for the one that was. Choosing `postgres` today leaves `apps/microservices/auth/package.json` with none of what `PostgresAuthStrategy` actually needs; it only builds because yarn's node_modules hoisting silently backfills from `libs/auth-strategies/postgres/package.json`'s own dependency list.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
// Add inside describe('writeProvider'), after the existing 'writes the provider file...' test:
  it('merges the chosen provider workspace alias + raw deps into the microservice package.json', async () => {
    const dir = await fixture();
    // Simulate the real-world case: the static package.json template has
    // NEITHER the workspace alias nor the raw SDK dep for 'beta' yet (unlike
    // the fixture's default, which pre-seeds both — this mirrors how
    // apps/microservices/auth/package.json has no @icore/auth-postgres entry
    // in the actual generator templates today).
    await writeFile(
      join(dir, 'apps/microservices/x/package.json'),
      JSON.stringify({ name: 'x', dependencies: { '@icore/x-alpha': '*', 'sdk-alpha': '^1.0.0' } }),
    );

    await writeProvider(dir, AXIS, 'beta');

    const pkg = JSON.parse(await readFile(join(dir, 'apps/microservices/x/package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({
      '@icore/x-alpha': '*',
      'sdk-alpha': '^1.0.0',
      '@icore/x-beta': '*',
      'sdk-beta': '^2.0.0',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts`
Expected: FAIL — `pkg.dependencies` is unchanged (`{'@icore/x-alpha': '*', 'sdk-alpha': '^1.0.0'}`), missing both `@icore/x-beta` and `sdk-beta`.

- [ ] **Step 3: Implement the merge in `writeProvider()`**

```typescript
// tools/create-icore/src/manifest/wire-provider.ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeDeps } from './assemble.js';
import type { Unit } from './types.js';

/** Per-axis wiring config: which manifest section + where the generated files live. */
export interface AxisWiring {
  section: Record<string, Unit>;
  providerFile: string;
  exportConst: string;
  msPackageJson: string;
  envPath: string;
}

/** Write the `<svc>.provider.ts` wiring the chosen provider's DynamicModule, and
 * merge its workspace alias + raw deps into the microservice's package.json —
 * cleanupUnusedAxis() only ever removes the unchosen providers' keys, so the
 * chosen one's own deps must be added here or the MS's manifest never
 * declares what it actually imports (works by yarn-hoisting accident only). */
export async function writeProvider(
  targetDir: string,
  axis: AxisWiring,
  provider: string,
): Promise<void> {
  const unit = axis.section[provider];
  const nestModule = unit?.nestModule;
  if (!nestModule) throw new Error(`provider "${provider}" has no nestModule in the manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${axis.envPath}';\n\n` +
    `export const ${axis.exportConst} = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, axis.providerFile), content);
  await mergeJsonDeps(join(targetDir, axis.msPackageJson), {
    [importFrom]: '*',
    ...mergeDeps([unit]),
  });
}

/** Merges `deps` into a package.json's `dependencies`, creating the field if absent. */
export async function mergeJsonDeps(path: string, deps: Record<string, string>): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    pkg.dependencies = { ...(pkg.dependencies ?? {}), ...deps };
    await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // pkg may be absent in partial fixtures
  }
}

export async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const k of Object.keys(deps)) if (drop(k)) delete deps[k];
    }
    await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // pkg may be absent in partial fixtures
  }
}

export async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
  const path = join(targetDir, 'tsconfig.base.json');
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    const paths = parsed.compilerOptions?.paths;
    if (paths) for (const a of aliases) delete paths[a];
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // tsconfig may be absent in partial fixtures
  }
}

/**
 * Remove every provider in the axis that was NOT chosen: its lib dirs, app-level
 * tests, workspace alias + raw SDK deps (from the MS package.json), and tsconfig
 * path aliases. Stripping `tsPaths ∪ deps` keeps the chosen provider's own deps
 * while pruning the rest — no source surgery.
 *
 * NOTE: the shared `@icore/firebase-admin` dep is owned by `removeFirebaseAdminLib`
 * (gated on whether ANY axis uses firebase), not here. A non-db axis using firebase
 * can leave an unused `@icore/firebase-admin` in the notes package.json — a separate,
 * harmless concern not addressed by this generic cleanup.
 */
export async function cleanupUnusedAxis(
  targetDir: string,
  axis: AxisWiring,
  chosen: string,
): Promise<void> {
  for (const provider of Object.keys(axis.section)) {
    if (provider === chosen) continue;
    const unit = axis.section[provider];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    for (const t of unit.appTests ?? []) await rm(join(targetDir, t), { force: true });
    const dropKeys = new Set([...Object.keys(unit.tsPaths), ...Object.keys(unit.deps)]);
    await stripJsonKeys(join(targetDir, axis.msPackageJson), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, Object.keys(unit.tsPaths));
  }
}
```

Note: `unit` (from `axis.section[provider]`) is typed `Unit | undefined` by the `Record` index signature; TypeScript narrows it via the `nestModule` null-check on the very next line (`if (!nestModule) throw ...`), so `unit` is safely non-undefined by the time it reaches `mergeDeps([unit])` — same narrowing pattern the original code already relied on for `unit.deps` reads elsewhere in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test create-icore -- wire-provider.unit.test.ts`
Expected: PASS — including the pre-existing `writeProvider`/`cleanupUnusedAxis` tests (the new merge step is additive; `cleanupUnusedAxis`'s own test fixture already pre-seeds both `dependencies` entries, so its assertions on the *unchosen* provider's keys being stripped are unaffected).

- [ ] **Step 5: Run the full manifest test suite (all 3 axes route through this shared function)**

Run: `npx nx test create-icore -- wire-auth.unit.test.ts wire-storage.unit.test.ts wire-db.unit.test.ts`
Expected: PASS — none of these axis-specific test files assert that the chosen provider's deps are *absent* from the MS package.json (they only assert the wiring file content and the unchosen-provider cleanup), so the new merge behavior doesn't break any existing expectation.

- [ ] **Step 6: Run the full create-icore suite**

Run: `npx nx test create-icore`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
npx prettier --write tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
npx nx lint create-icore
git add tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
git commit -m "fix(scaffold): writeProvider merges the chosen provider's own deps into the MS package.json"
```

---

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
