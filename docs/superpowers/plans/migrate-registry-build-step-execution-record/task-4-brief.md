### Task 4: Real git/fs-backed `BuildRegistryDeps` (`git-deps.ts`)

**Files:**
- Create: `tools/create-icore/src/migrations/git-deps.ts`
- Create: `tools/create-icore/src/migrations/__tests__/git-deps.unit.test.ts`
- Modify: `tools/create-icore/package.json` (add `minimatch` + `@changesets/parse` devDependencies)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**
- Consumes: `BuildRegistryDeps`, `ChangesetPair`, `ChangesetRelease`, `RegistryFile` types from Task 3 (`./build-registry.js`).
- Produces: `createGitDeps(repoRoot: string): Promise<BuildRegistryDeps>` — Task 5's script imports this.

- [ ] **Step 1: Add `minimatch` + `@changesets/parse` as devDependencies**

Edit `tools/create-icore/package.json`'s `devDependencies` to:

```json
"devDependencies": {
  "@changesets/parse": "^0.4.3",
  "@types/js-yaml": "^4.0.9",
  "@types/semver": "^7.7.1",
  "js-yaml": "^4.1.1",
  "minimatch": "^10.2.5",
  "semver": "^7.8.1",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated to include `minimatch@^10.2.5` and `@changesets/parse@^0.4.3`.

`minimatch` and `@changesets/parse` are imported by real source (`git-deps.ts`) but are build-tooling-only for the same reason `js-yaml`/`semver` are (Tasks 2/3): `src/migrations/**` is never a `tsup` entry, so this code never ships to `create-icore` end-users. Add both to the same `ignoredDependencies` allowlist in `tools/create-icore/eslint.config.mjs`:

```js
ignoredDependencies: ['tsup', 'vitest', 'js-yaml', 'semver', 'minimatch', '@changesets/parse'],
```

Run: `yarn nx lint create-icore`
Expected: 0 errors

- [ ] **Step 2: Write the failing test**

Create `tools/create-icore/src/migrations/__tests__/git-deps.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createGitDeps } from '../git-deps.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function gitOut(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd });
  return stdout.trim();
}

describe('createGitDeps (real git + fs)', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'icore-migreg-'));
    await git(repoRoot, ['init', '-q']);
    await git(repoRoot, ['config', 'user.email', 'test@example.com']);
    await git(repoRoot, ['config', 'user.name', 'Test']);
    await mkdir(join(repoRoot, '.changeset'), { recursive: true });
    await mkdir(join(repoRoot, 'tools/create-icore/migrations/codemods'), { recursive: true });
    await mkdir(join(repoRoot, 'apps/templates/client-mui/src'), { recursive: true });
    await writeFile(
      join(repoRoot, 'tools/create-icore/package.json'),
      JSON.stringify({ name: '@idevconn/create-icore', version: '0.12.2' }, null, 2),
    );
    await git(repoRoot, ['add', '-A']);
    await git(repoRoot, ['commit', '-q', '-m', 'init']);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('discovers a changeset + migration sibling pair and derives releases from real frontmatter', async () => {
    await writeFile(
      join(repoRoot, '.changeset/example.md'),
      '---\n"@idevconn/create-icore": patch\n---\n\nExample fix.\n',
    );
    await writeFile(
      join(repoRoot, '.changeset/example.migration.yml'),
      [
        'id: example-fix',
        'kind: codemod',
        'affectedAxes:',
        '  - "ui:mui"',
        'affectedGlobs:',
        '  - "apps/templates/client-mui/src/**"',
        'commitRange: "1234567..89abcde"',
        'description: "Example fix."',
      ].join('\n'),
    );

    const deps = await createGitDeps(repoRoot);
    const pairs = await deps.listChangesetPairs();
    const pair = pairs.find((p) => p.slug === 'example');
    expect(pair).toBeDefined();
    expect(pair?.changesetPath).toContain('example.md');
    expect(pair?.migrationYamlPath).toContain('example.migration.yml');
    expect(pair?.changesetReleases).toEqual([{ name: '@idevconn/create-icore', type: 'patch' }]);
  });

  it('resolves diffFiles/diffText against real git history, scoped by glob', async () => {
    const before = await gitOut(repoRoot, ['rev-parse', 'HEAD']);
    await writeFile(join(repoRoot, 'apps/templates/client-mui/src/Icon.tsx'), 'export const Icon = 1;\n');
    await writeFile(join(repoRoot, 'README.md'), 'unrelated change\n');
    await git(repoRoot, ['add', '-A']);
    await git(repoRoot, ['commit', '-q', '-m', 'change icon + readme']);
    const after = await gitOut(repoRoot, ['rev-parse', 'HEAD']);

    const deps = await createGitDeps(repoRoot);
    const files = await deps.diffFiles(`${before}..${after}`, ['apps/templates/client-mui/src/**']);
    expect(files).toEqual(['apps/templates/client-mui/src/Icon.tsx']);

    const diff = await deps.diffText(`${before}..${after}`, ['apps/templates/client-mui/src/**']);
    expect(diff).toContain('Icon.tsx');
    expect(diff).not.toContain('README.md');
  });

  it('codemodExists reflects a real file under migrations/codemods', async () => {
    const deps = await createGitDeps(repoRoot);
    expect(await deps.codemodExists('does-not-exist')).toBe(false);
    await writeFile(
      join(repoRoot, 'tools/create-icore/migrations/codemods/my-fix.ts'),
      'export default () => {};\n',
    );
    expect(await deps.codemodExists('my-fix')).toBe(true);
  });

  it('currentVersion reads tools/create-icore/package.json', async () => {
    const deps = await createGitDeps(repoRoot);
    expect(await deps.currentVersion()).toBe('0.12.2');
  });

  it('loadExistingRegistry returns empty entries when registry.json is absent', async () => {
    const deps = await createGitDeps(repoRoot);
    expect(await deps.loadExistingRegistry()).toEqual({ entries: [] });
  });

  it('loadExistingRegistry parses an existing registry.json', async () => {
    await mkdir(join(repoRoot, 'tools/create-icore/migrations'), { recursive: true });
    await writeFile(
      join(repoRoot, 'tools/create-icore/migrations/registry.json'),
      JSON.stringify({ entries: [{ id: 'x' }] }),
    );
    const deps = await createGitDeps(repoRoot);
    expect(await deps.loadExistingRegistry()).toEqual({ entries: [{ id: 'x' }] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn nx test create-icore -t "createGitDeps"`
Expected: FAIL with "Cannot find module '../git-deps.js'"

- [ ] **Step 4: Implement `git-deps.ts`**

Create `tools/create-icore/src/migrations/git-deps.ts`:

```typescript
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { minimatch } from 'minimatch';
import parseChangesetFile from '@changesets/parse';
import type {
  BuildRegistryDeps,
  ChangesetPair,
  ChangesetRelease,
  RegistryFile,
} from './build-registry.js';

const execFileAsync = promisify(execFile);

async function run(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 1024 * 1024 * 32 });
  return stdout;
}

/** Every path changed within `commitRange`, restricted to files matching any of `globs`. */
async function changedFilesInRange(
  repoRoot: string,
  commitRange: string,
  globs: string[],
): Promise<string[]> {
  const stdout = await run(repoRoot, ['diff', '--name-only', commitRange]);
  const all = stdout.split('\n').filter((line) => line.trim().length > 0);
  return all.filter((file) => globs.some((glob) => minimatch(file, glob)));
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/** Real `BuildRegistryDeps` backed by git, the filesystem, and `@changesets/parse`. */
export async function createGitDeps(repoRoot: string): Promise<BuildRegistryDeps> {
  const changesetDir = join(repoRoot, '.changeset');

  return {
    async listChangesetPairs(): Promise<ChangesetPair[]> {
      const dirEntries = await readdir(changesetDir);
      const slugs = new Set<string>();
      for (const entry of dirEntries) {
        if (entry.endsWith('.migration.yml')) {
          slugs.add(entry.slice(0, -'.migration.yml'.length));
        } else if (entry.endsWith('.md') && entry !== 'README.md') {
          slugs.add(entry.slice(0, -'.md'.length));
        }
      }

      const pairs: ChangesetPair[] = [];
      for (const slug of slugs) {
        const changesetPath = join(changesetDir, `${slug}.md`);
        const migrationYamlPath = join(changesetDir, `${slug}.migration.yml`);

        let changesetReleases: ChangesetRelease[] = [];
        let hasChangeset = false;
        try {
          const raw = await readFile(changesetPath, 'utf8');
          hasChangeset = true;
          const parsed = parseChangesetFile(raw);
          changesetReleases = parsed.releases as ChangesetRelease[];
        } catch (err) {
          if (!isEnoent(err)) throw err;
        }

        let migrationYamlRaw: string | null = null;
        let hasMigrationYaml = false;
        try {
          migrationYamlRaw = await readFile(migrationYamlPath, 'utf8');
          hasMigrationYaml = true;
        } catch (err) {
          if (!isEnoent(err)) throw err;
        }

        pairs.push({
          slug,
          changesetPath: hasChangeset ? changesetPath : null,
          migrationYamlPath: hasMigrationYaml ? migrationYamlPath : null,
          migrationYamlRaw: hasMigrationYaml ? migrationYamlRaw : null,
          changesetReleases,
        });
      }
      return pairs;
    },

    async codemodExists(id: string): Promise<boolean> {
      try {
        await readFile(join(repoRoot, 'tools/create-icore/migrations/codemods', `${id}.ts`));
        return true;
      } catch (err) {
        if (isEnoent(err)) return false;
        throw err;
      }
    },

    async diffFiles(commitRange: string, globs: string[]): Promise<string[]> {
      return changedFilesInRange(repoRoot, commitRange, globs);
    },

    async diffText(commitRange: string, globs: string[]): Promise<string> {
      const files = await changedFilesInRange(repoRoot, commitRange, globs);
      if (files.length === 0) return '';
      return run(repoRoot, ['diff', commitRange, '--', ...files]);
    },

    async currentVersion(): Promise<string> {
      const raw = await readFile(join(repoRoot, 'tools/create-icore/package.json'), 'utf8');
      const pkg = JSON.parse(raw) as { version: string };
      return pkg.version;
    },

    async loadExistingRegistry(): Promise<RegistryFile> {
      try {
        const raw = await readFile(
          join(repoRoot, 'tools/create-icore/migrations/registry.json'),
          'utf8',
        );
        return JSON.parse(raw) as RegistryFile;
      } catch (err) {
        if (isEnoent(err)) return { entries: [] };
        throw err;
      }
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "createGitDeps"`
Expected: PASS (all 6 cases)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/package.json yarn.lock tools/create-icore/src/migrations/git-deps.ts tools/create-icore/src/migrations/__tests__/git-deps.unit.test.ts
git commit -m "feat(create-icore): add real git/fs-backed BuildRegistryDeps"
```

---

