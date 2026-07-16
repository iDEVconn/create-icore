# create-icore `migrate` CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `create-icore migrate [--to <version>] [--continue]` CLI subcommand that walks an already-scaffolded project through pending migrations from `tools/create-icore/migrations/registry.json` (shipped by the already-merged sub-project 1, PR #249).

**Architecture:** A pure filtering module (`plan.ts`) computes which registry entries apply; a pure orchestration module (`run.ts`) walks that plan through an injected dependency interface (auto-chaining `codemod` entries, pausing at `ai-prompt` entries); a real implementation of that interface (`migrate-deps.ts`) backs it with actual git/fs; progress is tracked entirely via exact-match `migrate: <id>` commit-message markers in the target project's own git history — no state file. `cli.ts` gains a `migrate` subcommand branch reusing all of the above.

**Tech Stack:** TypeScript (Node16 module/moduleResolution, strict), Vitest, `semver` (becomes a real runtime `dependency` in this plan — see Task 7), `tsup` (gains dynamic per-codemod entries), reuses sub-project 1's `RegistryEntry`/`RegistryFile` types from `../migrations/build-registry.js`.

## Global Constraints

- Progress tracking has **no state file** — an entry counts as applied iff the target project's `git log` contains a commit whose subject is *exactly* `migrate: <id>` (verified experimentally: `git log --grep` combined with `--fixed-strings` and `^...$` anchors does NOT give exact-match semantics — anchors become literal characters under `--fixed-strings`, so exactness must be enforced in application code via `git log --format=%s` + JS string equality, not any grep flag combination).
- `--continue` is a documented no-op flag — re-running `migrate --to <version>` always resumes correctly on its own.
- Codemod entries load a compiled `.js` file from `dist/migrations/codemods/<id>.js` in the **installed package** — never a raw `.ts` file, since end users don't have `tsx`/ts-node available. `tools/create-icore/tsup.config.ts` must compile every `.ts` file under `migrations/codemods/` as its own standalone entry (no shared chunks — matches the existing `splitting: false` setting).
- `tools/create-icore/migrations/registry.json` must be added to `package.json`'s published `files` array (currently `["dist", "templates", "README.md", "LICENSE"]`) — it is not covered by any existing entry.
- `semver` is currently a `devDependency` (added in sub-project 1, allowlisted in `eslint.config.mjs`'s `ignoredDependencies` because it was build-tooling-only there). Once this plan's code makes `semver` reachable from the `cli` tsup entry (Task 7), it must become a real `dependency` and be removed from `ignoredDependencies` — leaving it dev-only would pass CI lint but break at runtime for real end-users (`npm install create-icore` wouldn't pull it in).
- Dirty git tree in the target project aborts `migrate` before anything is touched.
- A codemod's own function throwing propagates as a fatal error (not silently skipped) — matches the sub-project 1 codemod convention that a well-written codemod degrades to a no-op-with-warning itself; an actual throw means something unexpected happened.
- No `--skip` flag (skipping = manually committing `migrate: <id>` yourself), no `--undo` flag (plain `git reset`/`revert` suffice), no interactive REPL/dry-run — all explicitly out of scope per the spec.

---

### Task 1: `plan.ts` — pure filtering/ordering

**Files:**
- Create: `tools/create-icore/src/migrate/plan.ts`
- Test: `tools/create-icore/src/migrate/__tests__/plan.unit.test.ts`

**Interfaces:**
- Consumes: `RegistryEntry`, `RegistryFile` from `../migrations/build-registry.js` (sub-project 1, already merged).
- Produces: `computePlan(registry, currentVersion, targetVersion, projectAxes): RegistryEntry[]` — Task 7 calls this directly.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/plan.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePlan } from '../plan.js';
import type { RegistryEntry, RegistryFile } from '../../migrations/build-registry.js';

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'example',
    kind: 'codemod',
    affectedAxes: ['ui:mui'],
    affectedGlobs: ['apps/templates/client-mui/**'],
    commitRange: '1234567..89abcde',
    description: 'Example',
    version: '0.2.0',
    diff: '',
    ...over,
  };
}

describe('computePlan', () => {
  it('includes entries strictly above current version and up to (inclusive of) target', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'too-old', version: '0.1.0' }),
        entry({ id: 'in-range', version: '0.2.0' }),
        entry({ id: 'at-target', version: '0.3.0' }),
        entry({ id: 'too-new', version: '0.4.0' }),
      ],
    };
    const plan = computePlan(registry, '0.1.5', '0.3.0', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['in-range', 'at-target']);
  });

  it('excludes an entry whose version equals currentVersion (strictly greater-than)', () => {
    const registry: RegistryFile = { entries: [entry({ id: 'same', version: '0.2.0' })] };
    const plan = computePlan(registry, '0.2.0', '0.3.0', { ui: 'mui' });
    expect(plan).toEqual([]);
  });

  it('filters out entries whose axes do not all match the project', () => {
    const registry: RegistryFile = {
      entries: [
        entry({ id: 'matches', affectedAxes: ['ui:mui'] }),
        entry({ id: 'wrong-ui', affectedAxes: ['ui:antd'] }),
        entry({ id: 'multi-axis-match', affectedAxes: ['ui:mui', 'authProvider:postgres'] }),
        entry({ id: 'multi-axis-partial', affectedAxes: ['ui:mui', 'authProvider:supabase'] }),
      ],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui', authProvider: 'postgres' });
    expect(plan.map((e) => e.id)).toEqual(['matches', 'multi-axis-match']);
  });

  it('sorts the resulting plan by version ascending', () => {
    const registry: RegistryFile = {
      entries: [entry({ id: 'later', version: '0.5.0' }), entry({ id: 'earlier', version: '0.2.0' })],
    };
    const plan = computePlan(registry, '0.0.0', '9.9.9', { ui: 'mui' });
    expect(plan.map((e) => e.id)).toEqual(['earlier', 'later']);
  });

  it('returns an empty plan when nothing is in range', () => {
    const registry: RegistryFile = { entries: [entry({ version: '0.1.0' })] };
    expect(computePlan(registry, '0.5.0', '0.9.0', { ui: 'mui' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "computePlan"`
Expected: FAIL with "Cannot find module '../plan.js'"

- [ ] **Step 3: Implement `plan.ts`**

Create `tools/create-icore/src/migrate/plan.ts`:

```typescript
import semver from 'semver';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';

/**
 * Filters the bundled registry to entries strictly newer than the project's
 * current generatorVersion, up to (inclusive of) the requested target, whose
 * affectedAxes all match the project's blueprint selections — sorted ascending.
 */
export function computePlan(
  registry: RegistryFile,
  currentVersion: string,
  targetVersion: string,
  projectAxes: Record<string, string>,
): RegistryEntry[] {
  return registry.entries
    .filter(
      (entry) => semver.gt(entry.version, currentVersion) && semver.lte(entry.version, targetVersion),
    )
    .filter((entry) =>
      entry.affectedAxes.every((axis) => {
        const [axisName, unitId] = axis.split(':');
        return projectAxes[axisName] === unitId;
      }),
    )
    .sort((a, b) => semver.compare(a.version, b.version));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "computePlan"`
Expected: PASS (all 5 cases)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/plan.ts tools/create-icore/src/migrate/__tests__/plan.unit.test.ts
git commit -m "feat(create-icore): add migrate plan filtering (computePlan)"
```

---

### Task 2: `state.ts` — git-log-derived applied-check

**Files:**
- Create: `tools/create-icore/src/migrate/state.ts`
- Test: `tools/create-icore/src/migrate/__tests__/state.unit.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isApplied(id: string, projectDir: string): Promise<boolean>` — Task 3's `CodemodDeps` interface and Task 4's `migrate-deps.ts` both reference this exact signature.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/state.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isApplied } from '../state.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('isApplied', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-state-'));
    await git(repoRoot, ['init', '-q']);
    await git(repoRoot, ['config', 'user.email', 'test@example.com']);
    await git(repoRoot, ['config', 'user.name', 'Test']);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns false when no commit exists at all', async () => {
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });

  it('returns false when no matching commit exists', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'unrelated commit']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });

  it('returns true for an exact-match commit', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'migrate: foo-bar']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(true);
  });

  it('does not false-positive on a substring match (regression guard)', async () => {
    await git(repoRoot, ['commit', '--allow-empty', '-q', '-m', 'migrate: foo-barbaz']);
    expect(await isApplied('foo-bar', repoRoot)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "isApplied"`
Expected: FAIL with "Cannot find module '../state.js'"

- [ ] **Step 3: Implement `state.ts`**

Create `tools/create-icore/src/migrate/state.ts`:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * An entry counts as applied iff `projectDir`'s git history contains a
 * commit whose subject is EXACTLY `migrate: <id>`. Deliberately not
 * implemented via `git log --grep` — verified experimentally that no
 * combination of `--fixed-strings`/`^...$` gives exact-match semantics
 * (fixed-strings treats anchors as literal characters, so the pattern
 * then never matches; without fixed-strings, id substrings of a longer
 * real id false-positive). Exactness is enforced here instead.
 */
export async function isApplied(id: string, projectDir: string): Promise<boolean> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd: projectDir }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not have any commits yet')) return false;
    throw err;
  }
  const marker = `migrate: ${id}`;
  return stdout.split('\n').some((line) => line === marker);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "isApplied"`
Expected: PASS (all 4 cases)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/state.ts tools/create-icore/src/migrate/__tests__/state.unit.test.ts
git commit -m "feat(create-icore): add git-log-derived migrate applied-check (isApplied)"
```

---

### Task 3: `run.ts` — pure orchestration

**Files:**
- Create: `tools/create-icore/src/migrate/run.ts`
- Test: `tools/create-icore/src/migrate/__tests__/run.unit.test.ts`

**Interfaces:**
- Consumes: `RegistryEntry` from `../migrations/build-registry.js`.
- Produces: `CodemodDeps` interface, `MigrateResult` type (`'completed' | 'paused' | 'up-to-date'`), `runMigrate(projectDir, plan, targetVersion, deps, onAiPrompt): Promise<MigrateResult>` — Task 4's `migrate-deps.ts` implements `CodemodDeps`; Task 7's CLI wiring calls `runMigrate` directly.

- [ ] **Step 1: Write the failing test**

Create `tools/create-icore/src/migrate/__tests__/run.unit.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runMigrate, type CodemodDeps } from '../run.js';
import type { RegistryEntry } from '../../migrations/build-registry.js';

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'example',
    kind: 'codemod',
    affectedAxes: ['ui:mui'],
    affectedGlobs: ['x/**'],
    commitRange: '1234567..89abcde',
    description: 'Example',
    version: '0.2.0',
    diff: '',
    ...over,
  };
}

function makeDeps(over: Partial<CodemodDeps> = {}): CodemodDeps {
  return {
    isApplied: vi.fn().mockResolvedValue(false),
    isTreeClean: vi.fn().mockResolvedValue(true),
    commit: vi.fn().mockResolvedValue(undefined),
    loadCodemod: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
    bumpGeneratorVersion: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runMigrate', () => {
  it('returns up-to-date for an empty plan without checking the tree', async () => {
    const deps = makeDeps();
    const result = await runMigrate('/proj', [], '0.3.0', deps, vi.fn());
    expect(result).toBe('up-to-date');
    expect(deps.isTreeClean).not.toHaveBeenCalled();
  });

  it('throws on a dirty tree before touching any entry', async () => {
    const deps = makeDeps({ isTreeClean: vi.fn().mockResolvedValue(false) });
    await expect(runMigrate('/proj', [entry()], '0.3.0', deps, vi.fn())).rejects.toThrow(
      /not clean/,
    );
    expect(deps.isApplied).not.toHaveBeenCalled();
  });

  it('auto-chains through consecutive codemod entries and bumps the version at the end', async () => {
    const codemodFn = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ loadCodemod: vi.fn().mockResolvedValue(codemodFn) });
    const plan = [entry({ id: 'a', version: '0.2.0' }), entry({ id: 'b', version: '0.3.0' })];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, vi.fn());
    expect(result).toBe('completed');
    expect(codemodFn).toHaveBeenCalledTimes(2);
    expect(deps.commit).toHaveBeenNthCalledWith(1, '/proj', 'migrate: a');
    expect(deps.commit).toHaveBeenNthCalledWith(2, '/proj', 'migrate: b');
    expect(deps.bumpGeneratorVersion).toHaveBeenCalledWith('/proj', '0.3.0');
  });

  it('stops at the first ai-prompt entry without touching later entries', async () => {
    const onAiPrompt = vi.fn();
    const deps = makeDeps();
    const plan = [
      entry({ id: 'prompt-one', kind: 'ai-prompt', version: '0.2.0' }),
      entry({ id: 'never-reached', version: '0.3.0' }),
    ];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, onAiPrompt);
    expect(result).toBe('paused');
    expect(onAiPrompt).toHaveBeenCalledWith(plan[0]);
    expect(deps.isApplied).toHaveBeenCalledTimes(1);
    expect(deps.bumpGeneratorVersion).not.toHaveBeenCalled();
  });

  it('skips entries already marked applied', async () => {
    const codemodFn = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      isApplied: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      loadCodemod: vi.fn().mockResolvedValue(codemodFn),
    });
    const plan = [entry({ id: 'already-done' }), entry({ id: 'still-pending', version: '0.3.0' })];
    const result = await runMigrate('/proj', plan, '0.3.0', deps, vi.fn());
    expect(result).toBe('completed');
    expect(codemodFn).toHaveBeenCalledTimes(1);
    expect(deps.commit).toHaveBeenCalledWith('/proj', 'migrate: still-pending');
  });

  it('propagates a codemod function error without committing or bumping', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('anchor not found unexpectedly'));
    const deps = makeDeps({ loadCodemod: vi.fn().mockResolvedValue(failingFn) });
    await expect(runMigrate('/proj', [entry()], '0.3.0', deps, vi.fn())).rejects.toThrow(
      /anchor not found/,
    );
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.bumpGeneratorVersion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "runMigrate"`
Expected: FAIL with "Cannot find module '../run.js'"

- [ ] **Step 3: Implement `run.ts`**

Create `tools/create-icore/src/migrate/run.ts`:

```typescript
import type { RegistryEntry } from '../migrations/build-registry.js';

export interface CodemodDeps {
  loadCodemod(id: string): Promise<(projectDir: string) => void | Promise<void>>;
  isApplied(id: string, projectDir: string): Promise<boolean>;
  commit(projectDir: string, message: string): Promise<void>;
  isTreeClean(projectDir: string): Promise<boolean>;
  bumpGeneratorVersion(projectDir: string, targetVersion: string): Promise<void>;
}

export type MigrateResult = 'completed' | 'paused' | 'up-to-date';

/**
 * Walks `plan` in order: skips entries `deps.isApplied` already reports true
 * for, auto-applies+commits `codemod` entries and keeps chaining, and stops
 * (returns 'paused') at the first `ai-prompt` entry without touching any
 * entry after it. On a fully-applied plan, bumps generatorVersion and
 * returns 'completed'. All side effects flow through `deps` — this function
 * itself does no git/fs I/O.
 */
export async function runMigrate(
  projectDir: string,
  plan: RegistryEntry[],
  targetVersion: string,
  deps: CodemodDeps,
  onAiPrompt: (entry: RegistryEntry) => void,
): Promise<MigrateResult> {
  if (plan.length === 0) return 'up-to-date';

  if (!(await deps.isTreeClean(projectDir))) {
    throw new Error('Working tree is not clean. Commit or stash your changes before running migrate.');
  }

  for (const entry of plan) {
    if (await deps.isApplied(entry.id, projectDir)) continue;

    if (entry.kind === 'ai-prompt') {
      onAiPrompt(entry);
      return 'paused';
    }

    const fn = await deps.loadCodemod(entry.id);
    await fn(projectDir);
    await deps.commit(projectDir, `migrate: ${entry.id}`);
  }

  await deps.bumpGeneratorVersion(projectDir, targetVersion);
  return 'completed';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn nx test create-icore -t "runMigrate"`
Expected: PASS (all 6 cases)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/src/migrate/run.ts tools/create-icore/src/migrate/__tests__/run.unit.test.ts
git commit -m "feat(create-icore): add migrate orchestration (runMigrate)"
```

---

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

### Task 5: End-to-end integration test (`runMigrate` + real `migrate-deps.ts`, two-invocation resume)

**Files:**
- Create: `tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts`

**Interfaces:**
- Consumes: `computePlan` (Task 1), `runMigrate` (Task 3), `createMigrateDeps` (Task 4).
- Produces: nothing new — this task is pure verification that the pieces from Tasks 1, 3, and 4 compose correctly across a real pause/resume cycle.

- [ ] **Step 1: Write the test**

Create `tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { computePlan } from '../plan.js';
import { runMigrate } from '../run.js';
import { createMigrateDeps } from '../migrate-deps.js';
import type { RegistryFile } from '../../migrations/build-registry.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

async function gitLogSubjects(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd });
  return stdout.split('\n').filter((l) => l.length > 0);
}

describe('migrate end-to-end (real git, pause + resume)', () => {
  it('applies a codemod, pauses at an ai-prompt entry, then completes on a second run after the user commits manually', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'icore-migrate-e2e-proj-'));
    const packageRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-e2e-pkgroot-'));

    try {
      await git(projectDir, ['init', '-q']);
      await git(projectDir, ['config', 'user.email', 'test@example.com']);
      await git(projectDir, ['config', 'user.name', 'Test']);
      await writeFile(
        join(projectDir, 'blueprint.json'),
        JSON.stringify({ schemaVersion: 1, generatorVersion: '0.1.0', ui: 'mui' }, null, 2) + '\n',
      );
      await git(projectDir, ['add', '-A']);
      await git(projectDir, ['commit', '-q', '-m', 'init']);

      await mkdir(join(packageRoot, 'dist', 'migrations', 'codemods'), { recursive: true });
      await writeFile(
        join(packageRoot, 'dist', 'migrations', 'codemods', 'bump-a-value.js'),
        `import { writeFile } from 'node:fs/promises';\n` +
          `import { join } from 'node:path';\n` +
          `export default async function (projectDir) {\n` +
          `  await writeFile(join(projectDir, 'bumped.txt'), 'yes');\n` +
          `}\n`,
      );

      const registry: RegistryFile = {
        entries: [
          {
            id: 'bump-a-value',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '1234567..89abcde',
            description: 'Bump a value',
            version: '0.2.0',
            diff: '',
          },
          {
            id: 'manual-fix',
            kind: 'ai-prompt',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['y/**'],
            commitRange: '89abcde..fedcba9',
            description: 'A change requiring judgment',
            version: '0.3.0',
            diff: '--- a/y/thing.ts\n+++ b/y/thing.ts\n',
          },
        ],
      };

      const deps = createMigrateDeps({ packageRoot });
      const plan1 = computePlan(registry, '0.1.0', '0.3.0', { ui: 'mui' });
      let pausedEntry: { id: string } | null = null;
      const result1 = await runMigrate(projectDir, plan1, '0.3.0', deps, (entry) => {
        pausedEntry = entry;
      });

      expect(result1).toBe('paused');
      expect(pausedEntry?.id).toBe('manual-fix');
      expect(await readFile(join(projectDir, 'bumped.txt'), 'utf8')).toBe('yes');
      expect(await gitLogSubjects(projectDir)).toContain('migrate: bump-a-value');
      const blueprintAfterPause = JSON.parse(await readFile(join(projectDir, 'blueprint.json'), 'utf8'));
      expect(blueprintAfterPause.generatorVersion).toBe('0.1.0'); // not bumped yet

      // Simulate the user applying the ai-prompt entry through their own agent.
      await writeFile(join(projectDir, 'manual-change.txt'), 'done by hand');
      await git(projectDir, ['add', '-A']);
      await git(projectDir, ['commit', '-q', '-m', 'migrate: manual-fix']);

      const plan2 = computePlan(registry, '0.1.0', '0.3.0', { ui: 'mui' });
      const result2 = await runMigrate(projectDir, plan2, '0.3.0', deps, () => {
        throw new Error('should not pause again — both entries are already applied');
      });

      expect(result2).toBe('completed');
      const blueprintAfterComplete = JSON.parse(
        await readFile(join(projectDir, 'blueprint.json'), 'utf8'),
      );
      expect(blueprintAfterComplete.generatorVersion).toBe('0.3.0');
      expect(await gitLogSubjects(projectDir)).toContain('migrate: bump generatorVersion to 0.3.0');
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `yarn nx test create-icore -t "migrate end-to-end"`
Expected: PASS (this exercises real git commits and a real dynamically-imported codemod file, spanning Tasks 1, 3, and 4 — if it fails, the bug is in how those pieces compose, not within any single task's own unit tests)

- [ ] **Step 3: Commit**

```bash
git add tools/create-icore/src/migrate/__tests__/migrate-e2e.unit.test.ts
git commit -m "test(create-icore): add migrate end-to-end pause/resume integration test"
```

---

### Task 6: Ship codemods — dynamic `tsup` entries + `registry.json` in published files

**Files:**
- Modify: `tools/create-icore/tsup.config.ts`
- Modify: `tools/create-icore/package.json` (add `"migrations/registry.json"` to `files`)

**Interfaces:**
- Consumes: nothing from other tasks (pure build-tooling change).
- Produces: any `.ts` file later authored under `tools/create-icore/migrations/codemods/` compiles to a standalone `dist/migrations/codemods/<id>.js` — the exact path Task 4's `loadCodemod` already expects.

- [ ] **Step 1: Modify `tsup.config.ts`**

Change `tools/create-icore/tsup.config.ts` to:

```typescript
import { defineConfig } from 'tsup';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const { version: icoreVersion } = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string;
};

// Any .ts file under migrations/codemods/ compiles to its own standalone
// dist/migrations/codemods/<id>.js — this is what migrate-deps.ts's
// loadCodemod() dynamically imports at runtime from an end-user's
// installed package. No codemods exist yet (sub-project 1 and this plan
// both ship zero real entries), so this list is empty today and that's
// expected — the machinery just needs to be ready for the first one.
const here = dirname(fileURLToPath(import.meta.url));
const codemodsDir = join(here, 'migrations', 'codemods');
const codemodEntries: Record<string, string> = {};
if (existsSync(codemodsDir)) {
  for (const file of readdirSync(codemodsDir)) {
    if (file.endsWith('.ts')) {
      const id = basename(file, '.ts');
      codemodEntries[`migrations/codemods/${id}`] = join('migrations', 'codemods', file);
    }
  }
}

// Two entries with different output contracts:
//
// - `cli` is the bin script. It uses `import.meta.url` to resolve the
//   bundled `templates/` directory and pulls in `@clack/prompts` (ESM
//   only). Ship ESM only; no .d.ts.
// - `index` is the public library surface (`scaffold`, `collectOptions`,
//   `parseFlags`, option types). Ship dual ESM + CJS with .d.ts so
//   library consumers can `import` or `require` it.

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts', 'manifest/audit': 'src/manifest/audit.ts', ...codemodEntries },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: false,
    shims: true,
    splitting: false,
    define: { ICORE_OWN_VERSION: JSON.stringify(icoreVersion) },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    dts: true,
    shims: true,
    splitting: false,
  },
]);
```

- [ ] **Step 2: Modify `package.json`'s `files` array**

In `tools/create-icore/package.json`, change:

```json
"files": [
  "dist",
  "templates",
  "README.md",
  "LICENSE"
],
```

to:

```json
"files": [
  "dist",
  "templates",
  "migrations/registry.json",
  "README.md",
  "LICENSE"
],
```

- [ ] **Step 3: Verify the dynamic codemod compilation with a real scratch fixture**

```bash
mkdir -p tools/create-icore/migrations/codemods
cat > tools/create-icore/migrations/codemods/__scratch_verification__.ts <<'EOF'
export default function scratchVerification(projectDir: string): void {
  void projectDir;
}
EOF
yarn nx build create-icore
```

Run: `test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo FOUND`
Expected: `FOUND`

- [ ] **Step 4: Remove the scratch fixture and rebuild to confirm it cleanly disappears**

```bash
rm tools/create-icore/migrations/codemods/__scratch_verification__.ts
rmdir tools/create-icore/migrations/codemods 2>/dev/null || true
yarn nx build create-icore
```

Run: `test -f tools/create-icore/dist/migrations/codemods/__scratch_verification__.js && echo STILL_THERE || echo GONE`
Expected: `GONE`

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `yarn nx test create-icore`
Expected: PASS (all suites, including Tasks 1-5's new tests)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/tsup.config.ts tools/create-icore/package.json
git commit -m "feat(create-icore): compile migrations/codemods/*.ts as standalone dist entries, ship registry.json"
```

---

### Task 7: Wire `migrate` subcommand into `cli.ts`

**Files:**
- Create: `tools/create-icore/src/migrate/migrate-cli.ts`
- Modify: `tools/create-icore/src/cli.ts`
- Modify: `tools/create-icore/package.json` (move `semver` from `devDependencies` to `dependencies`)
- Modify: `tools/create-icore/eslint.config.mjs` (remove `'semver'` from `ignoredDependencies` — it's no longer build-tooling-only)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**
- Consumes: `computePlan` (Task 1), `runMigrate`/`CodemodDeps` (Task 3), `createMigrateDeps`/`resolvePackageRoot` (Task 4), `RegistryFile`/`RegistryEntry` from `../migrations/build-registry.js`, `BlueprintJson` from `../manifest/blueprint.js`.
- Produces: `runMigrateCli(argv: string[], projectDir?: string): Promise<void>` — the CLI entry point calls this; nothing later depends on it.

- [ ] **Step 1: Reclassify `semver` as a real runtime dependency**

Edit `tools/create-icore/package.json`'s `dependencies`/`devDependencies` blocks from:

```json
"dependencies": {
  "@clack/prompts": "^1.6.0",
  "kleur": "^4.1.5"
},
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

to:

```json
"dependencies": {
  "@clack/prompts": "^1.6.0",
  "kleur": "^4.1.5",
  "semver": "^7.8.1"
},
"devDependencies": {
  "@changesets/parse": "^0.4.3",
  "@types/js-yaml": "^4.0.9",
  "@types/semver": "^7.7.1",
  "js-yaml": "^4.1.1",
  "minimatch": "^10.2.5",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Edit `tools/create-icore/eslint.config.mjs`'s `ignoredDependencies` — remove `'semver'`:

```js
ignoredDependencies: ['tsup', 'vitest', 'js-yaml', 'minimatch', '@changesets/parse'],
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated (semver moves from one dependency block to another — content changes, no version bump needed since the version string itself is unchanged).

Run: `yarn nx lint create-icore`
Expected: 0 errors (semver is now a genuine declared dependency of a package that imports it — no allowlist needed, same as `@clack/prompts`/`kleur`)

- [ ] **Step 2: Write `migrate-cli.ts`**

Create `tools/create-icore/src/migrate/migrate-cli.ts`:

```typescript
import * as p from '@clack/prompts';
import kleur from 'kleur';
import semver from 'semver';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { computePlan } from './plan.js';
import { runMigrate } from './run.js';
import { createMigrateDeps, resolvePackageRoot } from './migrate-deps.js';
import type { RegistryEntry, RegistryFile } from '../migrations/build-registry.js';
import type { BlueprintJson } from '../manifest/blueprint.js';

function parseMigrateFlags(argv: string[]): { to?: string } {
  const flags: { to?: string } = {};
  for (const arg of argv) {
    if (arg.startsWith('--to=')) flags.to = arg.slice('--to='.length);
    // --continue is a documented no-op: re-running this command always
    // resumes correctly on its own (progress is derived from git history,
    // never stored) — kept as a recognized flag purely for expectation
    // parity with `nx migrate`'s own --continue.
  }
  return flags;
}

function highestVersion(registry: RegistryFile): string {
  return registry.entries.reduce((max, e) => (semver.gt(e.version, max) ? e.version : max), '0.0.0');
}

async function loadRegistry(): Promise<RegistryFile> {
  const root = resolvePackageRoot();
  const raw = await readFile(join(root, 'migrations', 'registry.json'), 'utf8');
  return JSON.parse(raw) as RegistryFile;
}

function printAiPromptInstructions(entry: RegistryEntry): void {
  p.log.info(`Paused at migration "${entry.id}":`);
  p.log.info(entry.description);
  if (entry.diff) p.log.info(entry.diff);
  p.log.info('Apply this change to your project, adapting to any local customization.');
  p.log.info(`When done, commit your work with a message containing exactly: migrate: ${entry.id}`);
  p.log.info('Then re-run this same command to continue.');
}

export async function runMigrateCli(argv: string[], projectDir: string = process.cwd()): Promise<void> {
  const flags = parseMigrateFlags(argv);

  let blueprint: BlueprintJson;
  try {
    blueprint = JSON.parse(await readFile(join(projectDir, 'blueprint.json'), 'utf8')) as BlueprintJson;
  } catch {
    throw new Error(
      `No blueprint.json found in ${projectDir} — is this a create-icore-scaffolded project?`,
    );
  }

  const registry = await loadRegistry();
  const currentVersion = blueprint.generatorVersion ?? '0.0.0';
  const targetVersion = flags.to ?? highestVersion(registry);

  const projectAxes: Record<string, string> = {
    authProvider: blueprint.authProvider,
    dbProvider: blueprint.dbProvider,
    upload: blueprint.upload,
    payment: blueprint.payment,
    jobs: blueprint.jobs,
    example: blueprint.example,
    ui: blueprint.ui,
    transport: blueprint.transport,
  };

  const plan = computePlan(registry, currentVersion, targetVersion, projectAxes);
  const deps = createMigrateDeps();
  const result = await runMigrate(projectDir, plan, targetVersion, deps, printAiPromptInstructions);

  if (result === 'up-to-date') p.outro(kleur.green('Already up to date.'));
  else if (result === 'paused') p.outro(kleur.yellow('Paused — see instructions above.'));
  else p.outro(kleur.green(`Migrated to ${targetVersion}.`));
}
```

- [ ] **Step 3: Wire the subcommand branch into `cli.ts`**

In `tools/create-icore/src/cli.ts`, add the import alongside the existing ones:

```typescript
import { runMigrateCli } from './migrate/migrate-cli.js';
```

and change `async function main() {` from:

```typescript
async function main() {
  if (!existsSync(templatesDir)) {
```

to:

```typescript
async function main() {
  if (process.argv[2] === 'migrate') {
    await runMigrateCli(process.argv.slice(3));
    return;
  }

  if (!existsSync(templatesDir)) {
```

(The existing `main().catch((err) => { p.log.error(...); process.exit(1); })` at the bottom of the file already handles any error `runMigrateCli` throws — including the dirty-tree error from `runMigrate` and the missing-`blueprint.json` error above — no separate error handling needed in the new module.)

- [ ] **Step 4: Real end-to-end smoke test of the wired CLI**

```bash
yarn nx build create-icore
REPO_ROOT="$(pwd)"
SCRATCH=$(mktemp -d)
cd "$SCRATCH"
git init -q
git config user.email test@example.com
git config user.name Test
cat > blueprint.json <<'EOF'
{
  "schemaVersion": 1,
  "projectName": "scratch",
  "authProvider": "supabase",
  "dbProvider": "supabase",
  "upload": "none",
  "payment": "none",
  "jobs": "none",
  "example": "none",
  "ui": "shadcn",
  "transport": "tcp",
  "packageManager": "yarn",
  "generatorVersion": "0.0.0"
}
EOF
git add -A
git commit -q -m "init"
node "$REPO_ROOT/tools/create-icore/dist/cli.js" migrate --to 99.0.0
cd "$REPO_ROOT"
rm -rf "$SCRATCH"
```

(Run this from the repo root — `REPO_ROOT="$(pwd)"` captures it before `cd`-ing into the scratch dir, so the step works regardless of machine/checkout path.)

Expected: prints `Already up to date.` and exits 0 — the bundled `registry.json` has zero entries (no real migrations authored anywhere yet), so `computePlan` returns an empty list for any target version, proving the full wiring (subcommand dispatch → registry load → blueprint read → plan computation → orchestration) works end-to-end without needing real migration content to exist yet.

- [ ] **Step 5: Run the full test suite and lint**

Run: `yarn nx test create-icore`
Expected: PASS (all suites)

Run: `yarn nx lint create-icore`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/migrate/migrate-cli.ts tools/create-icore/src/cli.ts tools/create-icore/package.json tools/create-icore/eslint.config.mjs yarn.lock
git commit -m "feat(create-icore): wire migrate subcommand into the CLI"
```

---

### Task 8: Documentation

**Files:**
- Modify: `tools/create-icore/README.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: nothing (documents Task 7's shipped behavior).
- Produces: nothing consumed by other tasks — this is the terminal task.

- [ ] **Step 1: Add a "Migrating an existing project" section to `tools/create-icore/README.md`**

Insert the following new section immediately before the existing `## Contributing` heading:

```markdown
## Migrating an existing project

Projects scaffolded by an older `create-icore` version can absorb generator/template fixes shipped since, without regenerating from scratch:

\`\`\`bash
cd my-existing-project
npx create-icore migrate --to latest   # or --to 0.15.0 for a specific version
\`\`\`

`migrate` requires a clean git working tree and walks any pending migrations relevant to your project's chosen providers/UI (read from your generated `blueprint.json`) one at a time:

- Mechanical fixes are applied and committed automatically (commit message `migrate: <id>`).
- Fixes that need judgment print a description and the real diff from how `create-icore`'s own template changed, then pause — apply the equivalent change yourself (with your own coding assistant, adapting to any customization you've made), commit your work with a message containing exactly `migrate: <id>`, then re-run the same `migrate` command to continue. Re-running is always safe — already-applied migrations are detected from your git history and skipped.

There is no separate resume flag needed (`--continue` is accepted for familiarity but does nothing extra); running the exact same command again always picks up where you left off.
```

- [ ] **Step 2: Add a note to `AGENTS.md`'s Architecture section**

In `AGENTS.md`, find this line in the `tools/` tree diagram (Architecture section):

```
└── create-icore/         # npx CLI source
```

Change it to:

```
└── create-icore/         # npx CLI source (scaffold new projects; `create-icore migrate` upgrades existing ones)
```

- [ ] **Step 3: Prettier + commit**

```bash
npx prettier --write tools/create-icore/README.md AGENTS.md
git add tools/create-icore/README.md AGENTS.md
git commit -m "docs(create-icore): document the migrate subcommand"
```

---

## Self-Review Notes

- **Spec coverage:** Command entry/flags → Task 7. `plan.ts` → Task 1. `state.ts`'s corrected exact-match design → Task 2. `run.ts` orchestration → Task 3. Real `CodemodDeps` → Task 4. Codemod convention/shipping → Task 6. Error handling (dirty tree, codemod throw, up-to-date, missing registry) → covered across Tasks 3, 4, 7's tests and the real smoke test. Testing section's real end-to-end pause/resume case → Task 5. Documentation section → Task 8. Out-of-scope items (`--skip`, `--undo`, REPL/dry-run, real registry entries) are not implemented anywhere in this plan.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `CodemodDeps` is defined once in Task 3 (`run.ts`) and implemented by Task 4's `createMigrateDeps` without redefinition. `RegistryEntry`/`RegistryFile` are imported from sub-project 1's `build-registry.ts` everywhere, never redefined. `MigrateResult`'s three literal values (`'completed' | 'paused' | 'up-to-date'`) are used identically in Task 3's implementation, Task 3's tests, and Task 7's CLI branch.
- **Cross-cutting correctness catch:** `semver`'s dependency classification is intentionally NOT changed until Task 7 — it stays a devDependency (harmlessly) through Tasks 1-6 since nothing yet makes it reachable from a real `tsup` entry; Task 7 is precisely where `migrate-cli.ts` gets imported by `cli.ts`, which is where the reclassification becomes load-bearing. Flagging this explicitly so no task before Task 7 "fixes" it prematurely or, worse, a reviewer flags it as missing in an earlier task where it isn't yet relevant.
