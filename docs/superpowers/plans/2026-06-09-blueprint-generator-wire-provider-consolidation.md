# Blueprint Generator — Consolidation: generic `wire-provider`

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Extract the triplicated logic in `wire-auth.ts` / `wire-storage.ts` / `wire-db.ts` (the `writeXProvider` + `cleanupUnusedX` + the `stripPkgKeys`/`stripTsconfigKeys` helpers) into one generic `wire-provider.ts`. The three axis modules become thin wrappers, so their public API (`writeAuthProvider`/`cleanupUnusedAuth`, etc.) — and therefore `scaffold.ts` and the existing tests — keep working. **Behavior change:** the generic strips `tsPaths ∪ deps` for ALL axes, which fixes the latent auth orphan (`cleanupUnusedAuth` previously left an unused `@supabase/supabase-js` in a non-supabase auth `package.json`).

**Architecture:** `wire-provider.ts` exports `writeProvider(targetDir, axis, provider)` + `cleanupUnusedAxis(targetDir, axis, chosen)` where `axis` is an `AxisWiring` config object (manifest section + paths). Each `wire-<x>.ts` declares its `AxisWiring` const and re-exports thin bound functions. Pure functions over fs; no scaffold.ts change.

**Tech Stack:** TS, Vitest. Tests: `yarn nx test create-icore`.

> **Out of scope (deliberately):** the `@icore/firebase-admin`-lingers-in-notes-pkg leftover (when a non-db axis uses firebase) needs axis-specific firebase-admin ownership logic — NOT this PR. Leave a one-line code comment noting it. This PR is the mechanical extraction + the auth raw-dep fix (which falls out for free).

---

## File Structure

- Create: `tools/create-icore/src/manifest/wire-provider.ts` — `AxisWiring`, `writeProvider`, `cleanupUnusedAxis` + the two strip helpers (single copy)
- Modify: `tools/create-icore/src/manifest/wire-auth.ts` — thin wrappers; delete its local helpers
- Modify: `tools/create-icore/src/manifest/wire-storage.ts` — thin wrappers; delete its local helpers
- Modify: `tools/create-icore/src/manifest/wire-db.ts` — thin wrappers; delete its local helpers
- Create: `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts` — fixture+assertions for the new raw-dep stripping
- Create: `.changeset/blueprint-wire-provider.md`

`scaffold.ts` is NOT modified (the wrappers preserve the exported function names/signatures).

---

### Task 1: Generic `wire-provider.ts`

**Files:**

- Create: `tools/create-icore/src/manifest/wire-provider.ts`
- Test: `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from '../wire-provider.js';
import type { Unit } from '../types.js';

const SECTION: Record<string, Unit> = {
  alpha: {
    libDirs: ['libs/x/alpha'],
    deps: { 'sdk-alpha': '^1.0.0' },
    tsPaths: { '@icore/x-alpha': ['libs/x/alpha/src/index.ts'] },
    nestModule: { importFrom: '@icore/x-alpha', symbol: 'AlphaModule', into: 'auth' },
    appTests: ['apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'],
  },
  beta: {
    libDirs: ['libs/x/beta'],
    deps: { 'sdk-beta': '^2.0.0' },
    tsPaths: { '@icore/x-beta': ['libs/x/beta/src/index.ts'] },
    nestModule: { importFrom: '@icore/x-beta', symbol: 'BetaModule', into: 'auth' },
  },
};

const AXIS: AxisWiring = {
  section: SECTION,
  providerFile: 'apps/microservices/x/src/app/x.provider.ts',
  exportConst: 'XProviderModule',
  msPackageJson: 'apps/microservices/x/package.json',
  envPath: 'apps/microservices/x/.env',
};

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wireprov-'));
  await mkdir(join(dir, 'apps/microservices/x/src/app/__tests__'), { recursive: true });
  await writeFile(join(dir, 'apps/microservices/x/src/app/x.provider.ts'), '// placeholder\n');
  await writeFile(
    join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
    '// alpha test',
  );
  for (const d of ['alpha', 'beta']) {
    await mkdir(join(dir, `libs/x/${d}/src`), { recursive: true });
    await writeFile(join(dir, `libs/x/${d}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/x/package.json'),
    JSON.stringify({
      name: 'x',
      dependencies: {
        '@icore/x-alpha': '*',
        '@icore/x-beta': '*',
        'sdk-alpha': '^1.0.0',
        'sdk-beta': '^2.0.0',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/x-alpha': ['libs/x/alpha/src/index.ts'],
          '@icore/x-beta': ['libs/x/beta/src/index.ts'],
        },
      },
    }),
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeProvider', () => {
  it('writes the provider file wiring the chosen module + export const', async () => {
    const dir = await fixture();
    await writeProvider(dir, AXIS, 'beta');
    const src = await readFile(join(dir, 'apps/microservices/x/src/app/x.provider.ts'), 'utf8');
    expect(src).toContain("import { BetaModule } from '@icore/x-beta';");
    expect(src).toContain('export const XProviderModule = BetaModule.forRoot(ENV_PATH);');
    expect(src).toContain("const ENV_PATH = 'apps/microservices/x/.env';");
  });

  it('throws when the chosen provider has no nestModule', async () => {
    const dir = await fixture();
    const bad: AxisWiring = { ...AXIS, section: { gamma: { libDirs: [], deps: {}, tsPaths: {} } } };
    await expect(writeProvider(dir, bad, 'gamma')).rejects.toThrow();
  });
});

describe('cleanupUnusedAxis', () => {
  it('removes unchosen libs, appTests, workspace+raw deps and tsconfig paths; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedAxis(dir, AXIS, 'alpha'); // keep alpha, drop beta

    expect(await exists(join(dir, 'libs/x/alpha'))).toBe(true);
    expect(await exists(join(dir, 'libs/x/beta'))).toBe(false);
    // alpha's controller test kept (it's the chosen one); beta has none
    expect(
      await exists(
        join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
      ),
    ).toBe(true);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/microservices/x/package.json'), 'utf8'));
    expect(pkg.dependencies).toEqual({ '@icore/x-alpha': '*', 'sdk-alpha': '^1.0.0' }); // beta workspace + raw sdk-beta stripped
    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/x-alpha']);
  });

  it('removes the chosen-elsewhere appTests of unchosen providers', async () => {
    const dir = await fixture();
    // add an alpha lib but choose beta -> alpha (with its appTest) must be removed
    await cleanupUnusedAxis(dir, AXIS, 'beta');
    expect(
      await exists(
        join(dir, 'apps/microservices/x/src/app/__tests__/x.controller.alpha.unit.test.ts'),
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail** (`yarn nx test create-icore -- wire-provider.unit`).

- [ ] **Step 3: Implement** — `wire-provider.ts`

```ts
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Unit } from './types.js';

/** Per-axis wiring config: which manifest section + where the generated files live. */
export interface AxisWiring {
  /** MANIFEST.auth | MANIFEST.storage | MANIFEST.db (provider key → Unit). */
  section: Record<string, Unit>;
  /** Relative path of the generated `<svc>.provider.ts`. */
  providerFile: string;
  /** Exported const name, e.g. 'AuthProviderModule'. */
  exportConst: string;
  /** Relative path of the microservice package.json to prune. */
  msPackageJson: string;
  /** ENV_PATH literal baked into the generated provider file. */
  envPath: string;
}

/** Write the `<svc>.provider.ts` wiring the chosen provider's DynamicModule. */
export async function writeProvider(
  targetDir: string,
  axis: AxisWiring,
  provider: string,
): Promise<void> {
  const nestModule = axis.section[provider]?.nestModule;
  if (!nestModule) throw new Error(`provider "${provider}" has no nestModule in the manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${axis.envPath}';\n\n` +
    `export const ${axis.exportConst} = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, axis.providerFile), content);
}

async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
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

async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
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

- [ ] **Step 4: Run → pass** (`yarn nx test create-icore -- wire-provider.unit`).

- [ ] **Step 5: Commit** `feat(create-icore): generic wire-provider (writeProvider + cleanupUnusedAxis)`.

---

### Task 2: Refactor `wire-auth.ts` → thin wrappers (+ raw-dep fix coverage)

**Files:**

- Modify: `tools/create-icore/src/manifest/wire-auth.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/wire-auth.unit.test.ts`

- [ ] **Step 1: Replace `wire-auth.ts` body with thin wrappers**

```ts
import type { AuthProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const AUTH: AxisWiring = {
  section: MANIFEST.auth as Record<string, Unit>,
  providerFile: 'apps/microservices/auth/src/app/auth.provider.ts',
  exportConst: 'AuthProviderModule',
  msPackageJson: 'apps/microservices/auth/package.json',
  envPath: 'apps/microservices/auth/.env',
};

export const writeAuthProvider = (targetDir: string, provider: AuthProvider): Promise<void> =>
  writeProvider(targetDir, AUTH, provider);

export const cleanupUnusedAuth = (targetDir: string, chosen: AuthProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, AUTH, chosen);
```

- [ ] **Step 2: Update the auth test for raw-dep stripping**

In `wire-auth.unit.test.ts`: add a raw SDK dep to the auth `package.json` fixture so the fix is covered. Add `'@supabase/supabase-js': '^2.106.2'` to the fixture `dependencies`. Then in the `cleanupUnusedAuth(dir, 'supabase')` test, change the assertion from `toEqual({ '@icore/auth-supabase': '*' })` to keep BOTH the chosen workspace dep and supabase's own raw SDK:

```ts
expect(pkg.dependencies).toEqual({
  '@icore/auth-supabase': '*',
  '@supabase/supabase-js': '^2.106.2',
});
```

Add a NEW test proving the orphan fix — choosing firebase strips supabase's raw SDK:

```ts
it('cleanupUnusedAuth(firebase) strips the unchosen supabase raw SDK from the auth package.json', async () => {
  const dir = await /* the same fixture builder used above */ makeAuthFixtureWithRawDep();
  await cleanupUnusedAuth(dir, 'firebase');
  const pkg = JSON.parse(await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'));
  expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js');
  expect(pkg.dependencies).not.toHaveProperty('@icore/auth-supabase');
  expect(pkg.dependencies['@icore/auth-firebase']).toBe('*');
});
```

(If the existing test inlines its fixture rather than using a helper, replicate the fixture inline in the new test — include `@supabase/supabase-js` in deps. Manifest `auth.supabase.deps` is `{ '@supabase/supabase-js': '^2.106.2' }` and `auth.firebase.deps` is `{}`, so firebase-chosen drops supabase's workspace alias + raw SDK; firebase has no raw SDK of its own to keep.)

- [ ] **Step 3: Run → pass** (`yarn nx test create-icore -- wire-auth.unit`). The appTests removal + workspace-alias strip still pass; the new raw-dep assertions pass.

- [ ] **Step 4: Commit** `refactor(create-icore): wire-auth delegates to wire-provider (+raw-dep strip fix)`.

---

### Task 3: Refactor `wire-storage.ts` + `wire-db.ts` → thin wrappers

**Files:** Modify `tools/create-icore/src/manifest/wire-storage.ts` + `wire-db.ts`.

- [ ] **Step 1: `wire-storage.ts`**

```ts
import type { StorageProvider } from './types.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const STORAGE: AxisWiring = {
  section: MANIFEST.storage as Record<string, Unit>,
  providerFile: 'apps/microservices/upload/src/app/storage.provider.ts',
  exportConst: 'StorageProviderModule',
  msPackageJson: 'apps/microservices/upload/package.json',
  envPath: 'apps/microservices/upload/.env',
};

export const writeStorageProvider = (targetDir: string, provider: StorageProvider): Promise<void> =>
  writeProvider(targetDir, STORAGE, provider);

export const cleanupUnusedStorage = (targetDir: string, chosen: StorageProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, STORAGE, chosen);
```

- [ ] **Step 2: `wire-db.ts`**

```ts
import type { DbProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';
import type { Unit } from './types.js';
import { writeProvider, cleanupUnusedAxis, type AxisWiring } from './wire-provider.js';

const DB: AxisWiring = {
  section: MANIFEST.db as Record<string, Unit>,
  providerFile: 'apps/microservices/notes/src/app/db.provider.ts',
  exportConst: 'DbProviderModule',
  msPackageJson: 'apps/microservices/notes/package.json',
  envPath: 'apps/microservices/notes/.env',
};

export const writeDbProvider = (targetDir: string, provider: DbProvider): Promise<void> =>
  writeProvider(targetDir, DB, provider);

export const cleanupUnusedDb = (targetDir: string, chosen: DbProvider): Promise<void> =>
  cleanupUnusedAxis(targetDir, DB, chosen);
```

- [ ] **Step 3: Run the existing storage + db tests** — they already expect `tsPaths ∪ deps` stripping, so they pass unchanged.

Run: `yarn nx test create-icore -- wire-storage.unit` → green.
Run: `yarn nx test create-icore -- wire-db.unit` → green.

- [ ] **Step 4: Commit** `refactor(create-icore): wire-storage + wire-db delegate to wire-provider`.

---

### Task 4: Full verification + e2e proof + changeset

- [ ] **Step 1: Full generator suite + build**

Run: `yarn nx test create-icore 2>&1 | tail -10` → green (wire-provider + wire-auth/storage/db + scaffold + manifest, scaffold.ts unchanged).
Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|wire-" || echo "ok (ignore uuid DTS)"`.
Run: `yarn nx lint create-icore 2>&1 | tail -5` → clean.

- [ ] **Step 2: E2E — prove the auth raw-dep fix end to end**

```bash
yarn nx build create-icore --skip-nx-cache 2>&1 | tail -2
T=/tmp/icore-consol && rm -rf "$T" && mkdir -p "$T"
cat > "$T/gen.mjs" <<'EOF'
import { scaffold } from '/home/vladimir-tkach/Projects/22/tools/create-icore/dist/index.js';
const a = process.argv[2];
await scaffold({ projectName: `auth-${a}`, targetDir: `${process.env.T}/auth-${a}`,
  authProvider: a, dbProvider: a, upload: a === 'mongodb' ? 'mongodb' : a,
  payment:'none', jobs:'none', example:'none', ui:'shadcn', transport:'tcp',
  initGit:false, packageManager:'npm', install:false },
  '/home/vladimir-tkach/Projects/22/tools/create-icore/templates');
console.log('gen', a);
EOF
# auth=firebase: the auth package.json must NOT contain @supabase/supabase-js anymore
T=$T node "$T/gen.mjs" firebase
grep -n "@supabase/supabase-js" "$T/auth-firebase/apps/microservices/auth/package.json" && echo "BAD: supabase SDK leaked" || echo "OK: no supabase SDK in firebase auth pkg"
node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/auth-firebase" && echo "AUDIT OK firebase"
# auth=supabase: must KEEP @supabase/supabase-js
T=$T node "$T/gen.mjs" supabase
grep -q "@supabase/supabase-js" "$T/auth-supabase/apps/microservices/auth/package.json" && echo "OK: supabase SDK kept for supabase auth" || echo "BAD: supabase SDK wrongly stripped"
node /home/vladimir-tkach/Projects/22/tools/create-icore/scripts/audit.mjs "$T/auth-supabase" && echo "AUDIT OK supabase"
```

Expected: `OK: no supabase SDK in firebase auth pkg` + `AUDIT OK firebase` + `OK: supabase SDK kept for supabase auth` + `AUDIT OK supabase`. If the firebase case still shows the leaked SDK, the wrapper/generic wiring is wrong — STOP + fix.

- [ ] **Step 3: Changeset** `.changeset/blueprint-wire-provider.md`:

```md
---
'@idevconn/create-icore': patch
---

Refactor: consolidate wire-auth/wire-storage/wire-db into a single generic wire-provider (writeProvider + cleanupUnusedAxis). Removes triplicated helpers. Side effect: the auth axis now also strips unchosen providers' raw SDK deps from the auth package.json (fixes an orphaned @supabase/supabase-js left in non-supabase auth scaffolds).
```

- [ ] **Step 4: Prettier + commit**

```bash
npx prettier --write tools/create-icore/src/manifest
git add .changeset/blueprint-wire-provider.md tools/create-icore/src/manifest
git commit -m "chore(create-icore): wire-provider consolidation changeset + format"
```

---

## Self-Review

**Spec coverage:** The "consolidate to a generic `wire-provider`" follow-up flagged by the storage/db code reviews + spec §3 (one source of truth for the assemble/wiring). Behavior-preserving for storage/db; auth gains raw-dep stripping (the documented latent fix).

**Placeholder scan:** Full code for the generic + all three wrappers + the auth test delta. The e2e step asserts the concrete before/after (firebase strips, supabase keeps). The firebase-admin-in-notes leftover is explicitly deferred with a code comment. No TBD.

**Type consistency:** `AxisWiring.section: Record<string, Unit>` (so `MANIFEST.auth/storage/db` cast in via `as Record<string, Unit>`). `writeProvider(targetDir, axis, provider: string)` + `cleanupUnusedAxis(targetDir, axis, chosen: string)`; the per-axis wrappers re-narrow to `AuthProvider`/`StorageProvider`/`DbProvider`, so `scaffold.ts`'s existing typed call sites are unchanged. Exported function names (`writeAuthProvider`/`cleanupUnusedAuth`/`writeStorageProvider`/`cleanupUnusedStorage`/`writeDbProvider`/`cleanupUnusedDb`) are identical to before.

**Scope:** Pure consolidation + auth raw-dep fix. No scaffold.ts change; no feature/client/transport work.
