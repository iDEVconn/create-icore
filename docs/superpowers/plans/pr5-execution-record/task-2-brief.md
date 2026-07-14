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

