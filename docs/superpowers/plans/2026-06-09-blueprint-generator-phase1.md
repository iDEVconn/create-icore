# Blueprint Generator — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the typed manifest + pure `resolveUnits`/`assemble` merge logic + a generated-project audit, all standalone (NOT wired into the live generator) so the old strip keeps working untouched.

**Architecture:** A typed TS manifest declares what each unit (provider/feature/ui/transport) contributes. `resolveUnits(opts)` maps a `CreateIcoreOptions` to the selected `Unit[]`. Pure merge helpers compute the union of deps / tsconfig paths / env blocks. `auditProject(dir)` flags any import of an absent `@icore/*` package or any forbidden raw SDK dep. Everything is a pure function over data — no filesystem in the manifest/resolve/merge layer, fixture dirs only in the audit tests.

**Tech Stack:** TypeScript, Vitest (`@nx/vitest:test`), Node fs/promises (audit only). Run tests with `yarn nx test create-icore`.

---

## File Structure

- Create: `tools/create-icore/src/manifest/types.ts` — `Unit`, `Manifest` interfaces
- Create: `tools/create-icore/src/manifest/index.ts` — the `MANIFEST` data (`satisfies Manifest`)
- Create: `tools/create-icore/src/manifest/resolve.ts` — `resolveUnits(opts)`
- Create: `tools/create-icore/src/manifest/assemble.ts` — `mergeDeps` / `mergeTsPaths` / `collectEnvBlocks`
- Create: `tools/create-icore/src/manifest/audit.ts` — `auditProject(dir)` → violations
- Create: `tools/create-icore/scripts/audit.mjs` — thin CLI wrapper over `auditProject`
- Test: `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts`
- Test: `tools/create-icore/src/manifest/__tests__/assemble.unit.test.ts`
- Test: `tools/create-icore/src/manifest/__tests__/audit.unit.test.ts`

Nothing under `src/lib/` is modified in Phase 1. The existing `scaffold-strip.ts` stays live.

---

### Task 1: Manifest types

**Files:**

- Create: `tools/create-icore/src/manifest/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type {
  AuthProvider,
  DbProvider,
  UploadProvider,
  UiLibrary,
  MsTransport,
} from '../lib/options.js';

/** What a single selectable unit contributes to the generated project. */
export interface Unit {
  /** Package directories copied verbatim iff this unit is selected. */
  libDirs: string[];
  /** Raw (non-`@icore`) deps merged into the root package.json. */
  deps: Record<string, string>;
  /** Path aliases merged into tsconfig.base.json. */
  tsPaths: Record<string, string[]>;
  /** A block appended to an env file (chosen units only). */
  envBlock?: { file: string; lines: string };
  /** A NestJS DynamicModule this unit owns, wired into a composition point. */
  nestModule?: {
    importFrom: string;
    symbol: string;
    into: 'auth' | 'upload' | 'notes' | 'gateway';
  };
  /** Entry added to GATEWAY_SERVICES in apps/api/src/main.ts. */
  gatewayService?: { name: string; prefix: string };
  /** Contribution to the client sidebar/routes. */
  clientNav?: { route: string; navEntry: string };
}

export type StorageProvider = Exclude<UploadProvider, 'none'>;

export interface Manifest {
  auth: Record<AuthProvider, Unit>;
  storage: Record<StorageProvider, Unit>;
  db: Record<DbProvider, Unit>;
  feature: { notes: Unit; payment: Unit; jobs: Unit };
  ui: Record<UiLibrary, Unit>;
  transport: Record<MsTransport, Unit>;
  /** Shared units pulled in by a cross-axis rule (not a direct user choice). */
  shared: { firebaseAdmin: Unit };
}
```

- [ ] **Step 2: Typecheck**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|manifest/types" || echo "no type errors in types.ts"`
Expected: no error referencing `manifest/types.ts` (a pre-existing unrelated `TS2688 uuid` DTS warning may appear — ignore it).

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore/src/manifest/types.ts
git commit -m "feat(create-icore): blueprint Unit/Manifest types"
```

---

### Task 2: Provider + shared manifest data

**Files:**

- Create: `tools/create-icore/src/manifest/index.ts`
- Test: `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts` (created in Task 3; the manifest is exercised there)

Only the axes Phase 4–5 need are populated now (auth, storage, db, shared). `feature`/`ui`/`transport` are typed-stubbed with empty units so `satisfies Manifest` holds; they are filled in their own phases (YAGNI).

- [ ] **Step 1: Write the manifest**

```ts
import type { Manifest, Unit } from './types.js';

const EMPTY: Unit = { libDirs: [], deps: {}, tsPaths: {} };

export const MANIFEST = {
  auth: {
    supabase: {
      libDirs: ['libs/auth-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-supabase',
        symbol: 'SupabaseAuthModule',
        into: 'auth',
      },
    },
    firebase: {
      libDirs: ['libs/auth-strategies/firebase'],
      deps: {},
      tsPaths: { '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-firebase',
        symbol: 'FirebaseAuthModule',
        into: 'auth',
      },
    },
    mongodb: {
      libDirs: ['libs/auth-strategies/mongodb'],
      deps: { mongoose: '^8.9.5' },
      tsPaths: { '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'] },
      nestModule: { importFrom: '@icore/auth-mongodb', symbol: 'MongoDbAuthModule', into: 'auth' },
    },
  },
  storage: {
    supabase: {
      libDirs: ['libs/storage-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/storage-supabase': ['libs/storage-strategies/supabase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-supabase',
        symbol: 'SupabaseStorageModule',
        into: 'upload',
      },
    },
    firebase: {
      libDirs: ['libs/storage-strategies/firebase'],
      deps: {},
      tsPaths: { '@icore/storage-firebase': ['libs/storage-strategies/firebase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-firebase',
        symbol: 'FirebaseStorageModule',
        into: 'upload',
      },
    },
    cloudinary: {
      libDirs: ['libs/storage-strategies/cloudinary'],
      deps: { cloudinary: '^2.10.0' },
      tsPaths: { '@icore/storage-cloudinary': ['libs/storage-strategies/cloudinary/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-cloudinary',
        symbol: 'CloudinaryStorageModule',
        into: 'upload',
      },
    },
    mongodb: {
      libDirs: ['libs/storage-strategies/mongodb'],
      deps: { mongoose: '^8.9.5' },
      tsPaths: { '@icore/storage-mongodb': ['libs/storage-strategies/mongodb/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/storage-mongodb',
        symbol: 'MongoDbStorageModule',
        into: 'upload',
      },
    },
  },
  db: {
    supabase: {
      libDirs: ['libs/db-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/db-supabase': ['libs/db-strategies/supabase/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-supabase', symbol: 'SupabaseDbModule', into: 'notes' },
    },
    firebase: {
      libDirs: ['libs/db-strategies/firestore'],
      deps: {},
      tsPaths: { '@icore/db-firestore': ['libs/db-strategies/firestore/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-firestore', symbol: 'FirestoreDbModule', into: 'notes' },
    },
    mongodb: {
      libDirs: ['libs/db-strategies/mongodb'],
      deps: { mongoose: '^8.9.5' },
      tsPaths: { '@icore/db-mongodb': ['libs/db-strategies/mongodb/src/index.ts'] },
      nestModule: { importFrom: '@icore/db-mongodb', symbol: 'MongoDbDbModule', into: 'notes' },
    },
  },
  feature: { notes: EMPTY, payment: EMPTY, jobs: EMPTY },
  ui: { shadcn: EMPTY, antd: EMPTY, mui: EMPTY },
  transport: { tcp: EMPTY, redis: EMPTY, nats: EMPTY, mqtt: EMPTY, rmq: EMPTY, kafka: EMPTY },
  shared: {
    firebaseAdmin: {
      libDirs: ['libs/firebase-admin'],
      deps: { 'firebase-admin': '^13.0.2' },
      tsPaths: { '@icore/firebase-admin': ['libs/firebase-admin/src/index.ts'] },
    },
  },
} satisfies Manifest;
```

- [ ] **Step 2: Typecheck**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "TS[0-9]|manifest/index" || echo "manifest typechecks"`
Expected: no error referencing `manifest/index.ts`. If `satisfies Manifest` fails, a key/shape is wrong — fix the offending entry.

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore/src/manifest/index.ts
git commit -m "feat(create-icore): provider+shared manifest data"
```

> NOTE: the `firebase-admin`, `mongoose`, `@supabase/supabase-js` version strings above are placeholders that MUST match the versions already declared in the corresponding `libs/*/package.json`. Before Step 3, run:
> `grep -rhE "\"(firebase-admin|mongoose|@supabase/supabase-js|cloudinary)\":" tools/create-icore/templates/libs/*/package.json tools/create-icore/templates/package.json | sort -u`
> and replace any mismatched version in the manifest with the real one.

---

### Task 3: `resolveUnits(opts)`

**Files:**

- Create: `tools/create-icore/src/manifest/resolve.ts`
- Test: `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveUnits } from '../resolve.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '/tmp/x',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  example: 'none',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

describe('resolveUnits', () => {
  it('supabase x3 selects only supabase auth/storage/db libs, no firebase-admin', () => {
    const libs = resolveUnits(base).flatMap((u) => u.libDirs);
    expect(libs).toContain('libs/auth-strategies/supabase');
    expect(libs).toContain('libs/storage-strategies/supabase');
    expect(libs).toContain('libs/db-strategies/supabase');
    expect(libs).not.toContain('libs/auth-strategies/firebase');
    expect(libs).not.toContain('libs/firebase-admin');
  });

  it('upload=none contributes no storage unit', () => {
    const libs = resolveUnits({ ...base, upload: 'none' }).flatMap((u) => u.libDirs);
    expect(libs.some((l) => l.startsWith('libs/storage-strategies/'))).toBe(false);
  });

  it('any firebase axis pulls in the shared firebase-admin unit exactly once', () => {
    const libs = resolveUnits({ ...base, dbProvider: 'firebase' }).flatMap((u) => u.libDirs);
    expect(libs.filter((l) => l === 'libs/firebase-admin')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -- resolve.unit`
Expected: FAIL — `resolveUnits` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CreateIcoreOptions } from '../lib/options.js';
import type { Unit } from './types.js';
import { MANIFEST } from './index.js';

/** Map the user's choices to the concrete set of units to add. Additive only. */
export function resolveUnits(opts: CreateIcoreOptions): Unit[] {
  const units: Unit[] = [
    MANIFEST.auth[opts.authProvider],
    MANIFEST.db[opts.dbProvider],
    MANIFEST.ui[opts.ui],
    MANIFEST.transport[opts.transport],
  ];
  if (opts.upload !== 'none') units.push(MANIFEST.storage[opts.upload]);
  if (opts.payment !== 'none') units.push(MANIFEST.feature.payment);
  if (opts.jobs !== 'none') units.push(MANIFEST.feature.jobs);
  if (opts.example === 'notes') units.push(MANIFEST.feature.notes);

  const firebaseUsed =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';
  if (firebaseUsed) units.push(MANIFEST.shared.firebaseAdmin);

  return units;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -- resolve.unit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/manifest/resolve.ts tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts
git commit -m "feat(create-icore): resolveUnits maps options to selected units"
```

---

### Task 4: assemble merge helpers

**Files:**

- Create: `tools/create-icore/src/manifest/assemble.ts`
- Test: `tools/create-icore/src/manifest/__tests__/assemble.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mergeDeps, mergeTsPaths, collectEnvBlocks } from '../assemble.js';
import type { Unit } from '../types.js';

const a: Unit = {
  libDirs: [],
  deps: { '@supabase/supabase-js': '^2.106.2' },
  tsPaths: { '@icore/auth-supabase': ['libs/a/src/index.ts'] },
  envBlock: { file: '.env', lines: 'A=1' },
};
const b: Unit = {
  libDirs: [],
  deps: { cloudinary: '^2.10.0' },
  tsPaths: { '@icore/storage-cloudinary': ['libs/b/src/index.ts'] },
};

describe('assemble merge helpers', () => {
  it('mergeDeps unions all unit deps', () => {
    expect(mergeDeps([a, b])).toEqual({
      '@supabase/supabase-js': '^2.106.2',
      cloudinary: '^2.10.0',
    });
  });

  it('mergeTsPaths unions all unit tsPaths', () => {
    expect(mergeTsPaths([a, b])).toEqual({
      '@icore/auth-supabase': ['libs/a/src/index.ts'],
      '@icore/storage-cloudinary': ['libs/b/src/index.ts'],
    });
  });

  it('collectEnvBlocks returns only units that declare one', () => {
    expect(collectEnvBlocks([a, b])).toEqual([{ file: '.env', lines: 'A=1' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -- assemble.unit`
Expected: FAIL — helpers not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Unit } from './types.js';

export function mergeDeps(units: Unit[]): Record<string, string> {
  return Object.assign({}, ...units.map((u) => u.deps));
}

export function mergeTsPaths(units: Unit[]): Record<string, string[]> {
  return Object.assign({}, ...units.map((u) => u.tsPaths));
}

export function collectEnvBlocks(units: Unit[]): NonNullable<Unit['envBlock']>[] {
  return units.flatMap((u) => (u.envBlock ? [u.envBlock] : []));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -- assemble.unit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/manifest/assemble.ts tools/create-icore/src/manifest/__tests__/assemble.unit.test.ts
git commit -m "feat(create-icore): assemble merge helpers (deps/tsPaths/env)"
```

---

### Task 5: `auditProject(dir)` + CLI

**Files:**

- Create: `tools/create-icore/src/manifest/audit.ts`
- Create: `tools/create-icore/scripts/audit.mjs`
- Test: `tools/create-icore/src/manifest/__tests__/audit.unit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditProject } from '../audit.js';

async function scaffold(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-audit-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}

describe('auditProject', () => {
  it('flags an import of an @icore package whose alias is absent from tsconfig', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `import { X } from '@icore/auth-firebase';`,
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'import-of-absent-lib',
        detail: expect.stringContaining('@icore/auth-firebase'),
      }),
    );
  });

  it('passes when every imported @icore alias exists in tsconfig paths', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { paths: { '@icore/auth-supabase': ['libs/a/src/index.ts'] } },
      }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `import { X } from '@icore/auth-supabase';`,
    });
    expect(await auditProject(dir)).toEqual([]);
  });

  it('flags a forbidden raw SDK dep listed in FORBIDDEN', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: { cloudinary: '^2.10.0' } }),
    });
    const v = await auditProject(dir, { forbiddenDeps: ['cloudinary'] });
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('cloudinary'),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -- audit.unit`
Expected: FAIL — `auditProject` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Violation {
  kind: 'import-of-absent-lib' | 'forbidden-dep';
  detail: string;
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.nx']);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) await walk(join(dir, e.name), out);
    } else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

async function tsconfigAliases(dir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } };
    return new Set(Object.keys(parsed.compilerOptions?.paths ?? {}));
  } catch {
    return new Set();
  }
}

async function rootDeps(dir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

const ICORE_IMPORT = /from '(@icore\/[a-z0-9-]+)'/g;

export async function auditProject(
  dir: string,
  opts: { forbiddenDeps?: string[] } = {},
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const aliases = await tsconfigAliases(dir);

  for (const file of await walk(dir)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(ICORE_IMPORT)) {
      const alias = m[1];
      if (!aliases.has(alias)) {
        violations.push({
          kind: 'import-of-absent-lib',
          detail: `${file} imports ${alias} (no tsconfig path → lib absent)`,
        });
      }
    }
  }

  const deps = await rootDeps(dir);
  for (const forbidden of opts.forbiddenDeps ?? []) {
    if (deps.has(forbidden)) {
      violations.push({
        kind: 'forbidden-dep',
        detail: `root package.json keeps forbidden dep ${forbidden}`,
      });
    }
  }

  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -- audit.unit`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the CLI wrapper**

```js
#!/usr/bin/env node
// Usage: node scripts/audit.mjs <project-dir> [forbiddenDep ...]
import { auditProject } from '../dist/manifest/audit.js';

const [dir, ...forbiddenDeps] = process.argv.slice(2);
if (!dir) {
  console.error('usage: audit.mjs <project-dir> [forbiddenDep ...]');
  process.exit(2);
}
const violations = await auditProject(dir, { forbiddenDeps });
if (violations.length) {
  for (const v of violations) console.error(`AUDIT ${v.kind}: ${v.detail}`);
  process.exit(1);
}
console.log('AUDIT OK: no orphan imports or forbidden deps');
```

- [ ] **Step 6: Verify the CLI wires to the build output**

Run: `yarn nx build create-icore --skip-nx-cache 2>&1 | grep -iE "manifest/audit|TS[0-9]" || echo "audit compiled"`
Expected: `audit.js` present under `dist/manifest/` (ignore the pre-existing `uuid` DTS warning).
Then: `node tools/create-icore/scripts/audit.mjs /tmp/icore-sweep/v3 cloudinary 2>&1 | tail -2` (v3 was generated supabase×3 earlier — should report `AUDIT OK`).
Expected: `AUDIT OK`.

- [ ] **Step 7: Commit**

```bash
git add tools/create-icore/src/manifest/audit.ts tools/create-icore/scripts/audit.mjs tools/create-icore/src/manifest/__tests__/audit.unit.test.ts
git commit -m "feat(create-icore): auditProject + CLI (orphan-import + forbidden-dep gate)"
```

---

### Task 6: Phase-1 close-out (lint + changeset)

**Files:**

- Create: `.changeset/blueprint-phase1.md`

- [ ] **Step 1: Lint the new module**

Run: `yarn nx lint create-icore 2>&1 | tail -5`
Expected: 0 errors (pre-existing warnings unrelated to `src/manifest/**` are tolerable).

- [ ] **Step 2: Run the full create-icore test suite**

Run: `yarn nx test create-icore 2>&1 | tail -15`
Expected: all suites PASS (new `resolve`/`assemble`/`audit` + existing scaffold/prompts tests untouched).

- [ ] **Step 3: Prettier the new files**

Run: `npx prettier --write tools/create-icore/src/manifest tools/create-icore/scripts/audit.mjs`
Expected: files reformatted, no error.

- [ ] **Step 4: Write the changeset**

```md
---
'@idevconn/create-icore': minor
---

Add the blueprint manifest engine (Phase 1): typed Unit/Manifest, resolveUnits, assemble merge helpers, and a generated-project audit. Standalone — not yet wired into generation; the existing strip path is unchanged.
```

- [ ] **Step 5: Commit**

```bash
git add .changeset/blueprint-phase1.md tools/create-icore
git commit -m "chore(create-icore): blueprint phase 1 changeset + format"
```

---

## Self-Review

**Spec coverage (Phase 1 slice of §8 row 1 + §4 manifest + §7 audit):**

- §4 typed manifest → Tasks 1–2 ✓
- §6 `resolveUnits` (pure) → Task 3 ✓
- §6 `assemble` union logic (deps/tsPaths/env) → Task 4 ✓ (file-writing wiring deferred to Phase 3 when static templates exist — explicitly out of Phase 1 per §8 sequencing)
- §7 audit (import-of-absent-lib + forbidden-dep) → Task 5 ✓ (the "real build" leg of §7 lands when the matrix is wired, Phase 9)
- §8 "parallel to the old strip, not wired in" → no `src/lib/` edits ✓

**Placeholder scan:** version strings in Task 2 are flagged with an explicit verification command (Step 3 NOTE) rather than left vague. No TBD/TODO. Audit `forbiddenDeps` is passed explicitly by the caller (the per-combo forbidden set is computed in Phase 9 when wiring the matrix) — Phase 1 only proves the mechanism.

**Type consistency:** `Unit`/`Manifest` (Task 1) used identically in Tasks 2–4. `Violation` shape (Task 5) matches the test's `expect.objectContaining`. `resolveUnits(opts: CreateIcoreOptions): Unit[]` and `auditProject(dir, opts?): Promise<Violation[]>` signatures consistent across tasks.

**Scope:** Phase 1 only. Phases 2–9 get their own plans, written once each prior phase's results are in.
