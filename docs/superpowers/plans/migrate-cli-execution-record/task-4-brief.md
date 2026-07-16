### Task 4: `migrate-deps.ts` — real `CodemodDeps` implementation

**Files:**

- Create: `tools/create-icore/src/migrate/migrate-deps.ts`
- Test: `tools/create-icore/src/migrate/__tests__/migrate-deps.unit.test.ts`

**Interfaces:**

- Consumes: `CodemodDeps` from `./run.js` (Task 3), `isApplied` from `./state.js` (Task 2), `BlueprintJson` from `../manifest/blueprint.js`.
- Produces: `resolvePackageRoot(): string`, `createMigrateDeps(opts?: { packageRoot?: string }): CodemodDeps` — Task 5's end-to-end test and Task 7's CLI wiring both call `createMigrateDeps`.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/migrate-deps.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMigrateDeps, resolvePackageRoot } from '../migrate-deps.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function gitLogSubjects(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd });
  return stdout.split('\n').filter((l) => l.length > 0);
}

describe('resolvePackageRoot', () => {
  it('resolves to the tools/create-icore package root from source form', () => {
    const root = resolvePackageRoot();
    expect(root.endsWith('create-icore')).toBe(true);
  });
});

describe('createMigrateDeps', () => {
  let projectDir: string;
  let packageRoot: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'icore-migrate-proj-'));
    packageRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-pkgroot-'));
    await git(projectDir, ['init', '-q']);
    await git(projectDir, ['config', 'user.email', 'test@example.com']);
    await git(projectDir, ['config', 'user.name', 'Test']);
    await writeFile(
      join(projectDir, 'blueprint.json'),
      JSON.stringify({ schemaVersion: 1, generatorVersion: '0.1.0', ui: 'mui' }, null, 2) + '\n',
    );
    await git(projectDir, ['add', '-A']);
    await git(projectDir, ['commit', '-q', '-m', 'init']);
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(packageRoot, { recursive: true, force: true });
  });

  it('isTreeClean reflects real git status', async () => {
    const deps = createMigrateDeps({ packageRoot });
    expect(await deps.isTreeClean(projectDir)).toBe(true);
    await writeFile(join(projectDir, 'dirty.txt'), 'x');
    expect(await deps.isTreeClean(projectDir)).toBe(false);
  });

  it('commit stages and commits with the exact message', async () => {
    const deps = createMigrateDeps({ packageRoot });
    await writeFile(join(projectDir, 'new-file.txt'), 'content');
    await deps.commit(projectDir, 'migrate: some-id');
    expect(await gitLogSubjects(projectDir)).toContain('migrate: some-id');
    expect(await deps.isTreeClean(projectDir)).toBe(true);
  });

  it('bumpGeneratorVersion rewrites blueprint.json and commits', async () => {
    const deps = createMigrateDeps({ packageRoot });
    await deps.bumpGeneratorVersion(projectDir, '0.5.0');
    const blueprint = JSON.parse(await readFile(join(projectDir, 'blueprint.json'), 'utf8'));
    expect(blueprint.generatorVersion).toBe('0.5.0');
    expect(await gitLogSubjects(projectDir)).toContain('migrate: bump generatorVersion to 0.5.0');
  });

  it('loadCodemod imports a real compiled codemod file and returns its default export', async () => {
    await mkdir(join(packageRoot, 'dist', 'migrations', 'codemods'), { recursive: true });
    await writeFile(
      join(packageRoot, 'dist', 'migrations', 'codemods', 'write-marker.js'),
      `import { writeFile } from 'node:fs/promises';\n` +
        `import { join } from 'node:path';\n` +
        `export default async function (projectDir) {\n` +
        `  await writeFile(join(projectDir, 'marker.txt'), 'applied');\n` +
        `}\n`,
    );
    const deps = createMigrateDeps({ packageRoot });
    const fn = await deps.loadCodemod('write-marker');
    await fn(projectDir);
    expect(await readFile(join(projectDir, 'marker.txt'), 'utf8')).toBe('applied');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "createMigrateDeps"`
Expected: FAIL with "Cannot find module '../migrate-deps.js'"

- [ ] **Step 3: Implement `migrate-deps.ts`**

Create `tools/create-icore/src/migrate/migrate-deps.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isApplied } from './state.js';
import type { CodemodDeps } from './run.js';
import type { BlueprintJson } from '../manifest/blueprint.js';

const execFileAsync = promisify(execFile);

async function run(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

/**
 * Locates the create-icore package root by walking up from this module's
 * own location. Two real shapes: bundled (`dist/cli.js`, this code inlined
 * — one level up is the package root) and source (running under Vitest
 * from `src/migrate/migrate-deps.ts` — two levels up is the package root).
 * Picks the first candidate that actually contains a package.json.
 */
export function resolvePackageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..'), join(here, '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  throw new Error('Could not resolve the create-icore package root');
}

export function createMigrateDeps(opts: { packageRoot?: string } = {}): CodemodDeps {
  const packageRoot = opts.packageRoot ?? resolvePackageRoot();

  return {
    isApplied,

    async isTreeClean(projectDir: string): Promise<boolean> {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: projectDir });
      return stdout.trim().length === 0;
    },

    async commit(projectDir: string, message: string): Promise<void> {
      await run(projectDir, ['add', '-A']);
      await run(projectDir, ['commit', '-m', message]);
    },

    async loadCodemod(id: string): Promise<(projectDir: string) => void | Promise<void>> {
      const codemodPath = join(packageRoot, 'dist', 'migrations', 'codemods', `${id}.js`);
      const mod = (await import(pathToFileURL(codemodPath).href)) as {
        default: (projectDir: string) => void | Promise<void>;
      };
      return mod.default;
    },

    async bumpGeneratorVersion(projectDir: string, targetVersion: string): Promise<void> {
      const blueprintPath = join(projectDir, 'blueprint.json');
      const blueprint = JSON.parse(await readFile(blueprintPath, 'utf8')) as BlueprintJson;
      blueprint.generatorVersion = targetVersion;
      await writeFile(blueprintPath, JSON.stringify(blueprint, null, 2) + '\n');
      await run(projectDir, ['add', '-A']);
      await run(projectDir, ['commit', '-m', `migrate: bump generatorVersion to ${targetVersion}`]);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "createMigrateDeps"`
Expected: PASS (all 5 cases, including `resolvePackageRoot`)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/migrate-deps.ts tools/create-icore/src/migrate/__tests__/migrate-deps.unit.test.ts
git commit -m "feat(create-icore): add real git/fs-backed migrate CodemodDeps"
```

---
