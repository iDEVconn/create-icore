# create-icore Migration Registry + Build Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data pipeline that lets future generator/template fixes in `create-icore` be recorded as versioned migration entries and baked into a shippable `tools/create-icore/migrations/registry.json`, without touching changeset tooling or writing any CLI execution logic yet (that's a separate, later plan).

**Architecture:** Migration metadata lives in an optional sibling file next to a changeset (`.changeset/<slug>.migration.yml`) — never inside the changeset's own YAML frontmatter, which `@changesets/parse` cannot tolerate extra keys in. A pure core module (`build-registry.ts`) takes an injected `BuildRegistryDeps` interface and produces a `RegistryFile`; a real implementation (`git-deps.ts`) backs that interface with actual git/fs/yaml/changeset-parsing; a thin `tsx`-run script wires the two together and is invoked as an `nx` build target that runs before `changeset version`. `blueprint.json` gains a `generatorVersion` field as the anchor a future `migrate` CLI will use.

**Tech Stack:** TypeScript (Node16 module/moduleResolution, strict), Vitest, `js-yaml`, `semver`, `minimatch`, `@changesets/parse`, `tsx` (already a root devDependency), Nx `run-commands` executor.

## Global Constraints

- `commitRange` must match `<sha>..<sha>`, each side 7-40 hex chars (spec §2).
- Migration metadata is a **sibling file** (`.changeset/<slug>.migration.yml`), **never** nested inside changeset frontmatter — verified that `@changesets/parse` throws if frontmatter contains a non-string-typed key (spec §2 correction).
- The build script must run **before** `changeset version` (which deletes consumed `.md` changeset files) — spec §4 step 1.
- `kind: codemod` entries must be narrow/anchor-based (not whole-file overwrites) — drift-safety requirement from the L99 decision record, enforced by convention/review, not by code in this plan.
- All build-step validation failures are **release-blocking**: throw, never silently skip or continue (spec's Error Handling section) — the one exception is glob-scoping itself, which is normal filtering, not an error path.
- `tools/create-icore/migrations/registry.json` is a **committed, versioned artifact** — confirmed NOT covered by any existing `.gitignore` pattern (only `tools/create-icore/templates/` is ignored).
- Out of scope for this plan (per spec): the `migrate` CLI itself, backfilling real registry entries, any change to existing changeset-gate enforcement.

---

### Task 1: `generatorVersion` field in `blueprint.json`

**Files:**
- Modify: `tools/create-icore/src/lib/prompts.ts` (export the existing `readSelfVersion`)
- Modify: `tools/create-icore/src/manifest/blueprint.ts`
- Modify: `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts`

**Interfaces:**
- Consumes: existing `readSelfVersion(): Promise<string | null>` (currently private to `prompts.ts:27`), existing `writeBlueprintJson(targetDir, opts)`.
- Produces: `BlueprintJson.generatorVersion: string` — later tasks/plans (the `migrate` CLI, out of scope here) will read this field to know "what version is this project currently at."

- [ ] **Step 1: Write the failing test — modify the existing `writeBlueprintJson` test**

Replace the first `it(...)` block in `tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts` (currently lines 30-51) with:

```typescript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ...(keep existing imports; add the two above alongside them)

describe('writeBlueprintJson', () => {
  it('writes blueprint.json with the chosen selection (no transient fields)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-bp-'));
    await writeBlueprintJson(dir, { ...opts, targetDir: dir });
    const bp = JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8'));

    const here = dirname(fileURLToPath(import.meta.url));
    const ownPkg = JSON.parse(
      await readFile(join(here, '../../../package.json'), 'utf8'),
    ) as { version: string };

    expect(bp).toEqual({
      schemaVersion: 1,
      projectName: 'my-app',
      authProvider: 'firebase',
      dbProvider: 'mongodb',
      upload: 'cloudinary',
      payment: 'paypal',
      jobs: 'bullmq',
      example: 'notes',
      ui: 'antd',
      transport: 'nats',
      packageManager: 'pnpm',
      generatorVersion: ownPkg.version,
    });
    // transient fields excluded
    expect(bp).not.toHaveProperty('targetDir');
    expect(bp).not.toHaveProperty('install');
    expect(bp).not.toHaveProperty('initGit');
  });
```

Leave the second test (`'is deterministic (no timestamp) — two writes byte-match'`) unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn nx test create-icore -t "writes blueprint.json"`
Expected: FAIL — `bp` is missing the `generatorVersion` key the assertion now expects.

- [ ] **Step 3: Export `readSelfVersion` from `prompts.ts`**

In `tools/create-icore/src/lib/prompts.ts:27`, change:

```typescript
async function readSelfVersion(): Promise<string | null> {
```

to:

```typescript
export async function readSelfVersion(): Promise<string | null> {
```

- [ ] **Step 4: Add `generatorVersion` to `blueprint.ts`**

In `tools/create-icore/src/manifest/blueprint.ts`, change the top imports and `BlueprintJson`/`writeBlueprintJson` to:

```typescript
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CreateIcoreOptions } from '../lib/options.js';
import { readSelfVersion } from '../lib/prompts.js';

export interface BlueprintJson {
  schemaVersion: 1;
  projectName: string;
  authProvider: string;
  dbProvider: string;
  upload: string;
  payment: string;
  jobs: string;
  example: string;
  ui: string;
  transport: string;
  packageManager: string;
  generatorVersion: string;
}

/**
 * Record the scaffold selection at the project root. A provenance + audit-input
 * artifact ("what was this generated with?"). Transient fields (targetDir,
 * install, initGit) are excluded; no timestamp, so output is deterministic.
 * `generatorVersion` anchors a future `create-icore migrate` command — a
 * project missing this field (pre-existing scaffolds) is treated as version 0.
 */
export async function writeBlueprintJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const generatorVersion = (await readSelfVersion()) ?? '0.0.0';
  const blueprint: BlueprintJson = {
    schemaVersion: 1,
    projectName: opts.projectName,
    authProvider: opts.authProvider,
    dbProvider: opts.dbProvider,
    upload: opts.upload,
    payment: opts.payment,
    jobs: opts.jobs,
    example: opts.example,
    ui: opts.ui,
    transport: opts.transport,
    packageManager: opts.packageManager,
    generatorVersion,
  };
  await writeFile(join(targetDir, 'blueprint.json'), JSON.stringify(blueprint, null, 2) + '\n');
}
```

(The rest of the file — `writeJson` and `writeServiceBlueprints` — is unchanged.)

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "writeBlueprintJson"`
Expected: PASS (both tests in the `describe('writeBlueprintJson', ...)` block)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/src/lib/prompts.ts tools/create-icore/src/manifest/blueprint.ts tools/create-icore/src/manifest/__tests__/blueprint.unit.test.ts
git commit -m "feat(create-icore): record generatorVersion in blueprint.json"
```

---

### Task 2: Migration entry schema + `.migration.yml` parser

**Files:**
- Create: `tools/create-icore/src/migrations/schema.ts`
- Create: `tools/create-icore/src/migrations/__tests__/schema.unit.test.ts`
- Modify: `tools/create-icore/package.json` (add `js-yaml` + `@types/js-yaml` devDependencies)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `MigrationKind = 'codemod' | 'ai-prompt'`, `MigrationEntry { id, kind, affectedAxes: string[], affectedGlobs: string[], commitRange, description }`, and `parseMigrationYaml(raw: string, sourcePath: string): MigrationEntry` — Task 3 imports this type and function.

- [ ] **Step 1: Add `js-yaml` + types as devDependencies**

Edit `tools/create-icore/package.json`'s `devDependencies` (currently `{ "tsup": "^8.5.1", "vitest": "^4.1.9" }`) to:

```json
"devDependencies": {
  "@types/js-yaml": "^4.0.9",
  "js-yaml": "^4.1.1",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated to include `js-yaml@^4.1.1` and `@types/js-yaml@^4.0.9`.

- [ ] **Step 2: Write the failing test**

Create `tools/create-icore/src/migrations/__tests__/schema.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseMigrationYaml } from '../schema.js';

const VALID_YAML = [
  'id: mui-9-2-icon-rename',
  'kind: codemod',
  'affectedAxes:',
  '  - "ui:mui"',
  'affectedGlobs:',
  '  - "apps/templates/client-mui/src/**/*.tsx"',
  'commitRange: "336161f..a1b2c3d"',
  'description: "Rename 3 icon imports for MUI v9."',
].join('\n');

describe('parseMigrationYaml', () => {
  it('parses a valid migration yaml', () => {
    const entry = parseMigrationYaml(VALID_YAML, '.changeset/mui-9-2-icon-rename.migration.yml');
    expect(entry).toEqual({
      id: 'mui-9-2-icon-rename',
      kind: 'codemod',
      affectedAxes: ['ui:mui'],
      affectedGlobs: ['apps/templates/client-mui/src/**/*.tsx'],
      commitRange: '336161f..a1b2c3d',
      description: 'Rename 3 icon imports for MUI v9.',
    });
  });

  it('throws when id is missing', () => {
    const yamlText = VALID_YAML.replace(/^id: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(/"id" must be a non-empty string/);
  });

  it('throws when kind is invalid', () => {
    const yamlText = VALID_YAML.replace('kind: codemod', 'kind: rewrite-everything');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"kind" must be "codemod" or "ai-prompt"/,
    );
  });

  it('throws when affectedAxes is empty', () => {
    const yamlText = VALID_YAML.replace(/affectedAxes:\n\s+- "ui:mui"/, 'affectedAxes: []');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedAxes" must be a non-empty array/,
    );
  });

  it('throws when affectedGlobs is empty', () => {
    const yamlText = VALID_YAML.replace(
      /affectedGlobs:\n\s+- "apps\/templates\/client-mui\/src\/\*\*\/\*\.tsx"/,
      'affectedGlobs: []',
    );
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"affectedGlobs" must be a non-empty array/,
    );
  });

  it('throws when commitRange is malformed', () => {
    const yamlText = VALID_YAML.replace('336161f..a1b2c3d', 'not-a-range');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(/"commitRange" must match/);
  });

  it('throws when description is missing', () => {
    const yamlText = VALID_YAML.replace(/^description: .*$/m, '');
    expect(() => parseMigrationYaml(yamlText, 'bad.yml')).toThrow(
      /"description" must be a non-empty string/,
    );
  });

  it('throws when top-level content is not a mapping', () => {
    expect(() => parseMigrationYaml('- just\n- a\n- list', 'bad.yml')).toThrow(
      /top-level content must be a YAML mapping/,
    );
  });

  it('throws with the source path in the error message', () => {
    expect(() =>
      parseMigrationYaml('not: valid\nkind: whatever', '.changeset/foo.migration.yml'),
    ).toThrow(/\.changeset\/foo\.migration\.yml/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn nx test create-icore -t "parseMigrationYaml"`
Expected: FAIL with "Cannot find module '../schema.js'" (or equivalent — the module doesn't exist yet)

- [ ] **Step 4: Implement `schema.ts`**

Create `tools/create-icore/src/migrations/schema.ts`:

```typescript
import * as yaml from 'js-yaml';

export type MigrationKind = 'codemod' | 'ai-prompt';

export interface MigrationEntry {
  id: string;
  kind: MigrationKind;
  affectedAxes: string[];
  affectedGlobs: string[];
  commitRange: string;
  description: string;
}

const COMMIT_RANGE_RE = /^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/;

function fail(sourcePath: string, message: string): never {
  throw new Error(`Invalid migration entry in ${sourcePath}: ${message}`);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

/**
 * Parses and validates a `.migration.yml` sibling file's raw text.
 * Throws on any missing/malformed field — the build step treats every
 * failure as release-blocking.
 */
export function parseMigrationYaml(raw: string, sourcePath: string): MigrationEntry {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    fail(sourcePath, `not valid YAML (${err instanceof Error ? err.message : String(err)})`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail(sourcePath, 'top-level content must be a YAML mapping (object)');
  }
  const obj = parsed as Record<string, unknown>;

  if (!isNonEmptyString(obj['id'])) fail(sourcePath, '"id" must be a non-empty string');
  if (obj['kind'] !== 'codemod' && obj['kind'] !== 'ai-prompt') {
    fail(sourcePath, '"kind" must be "codemod" or "ai-prompt"');
  }
  if (!isNonEmptyStringArray(obj['affectedAxes'])) {
    fail(sourcePath, '"affectedAxes" must be a non-empty array of non-empty strings');
  }
  if (!isNonEmptyStringArray(obj['affectedGlobs'])) {
    fail(sourcePath, '"affectedGlobs" must be a non-empty array of non-empty strings');
  }
  if (
    !isNonEmptyString(obj['commitRange']) ||
    !COMMIT_RANGE_RE.test(obj['commitRange'] as string)
  ) {
    fail(sourcePath, '"commitRange" must match "<sha>..<sha>" (7-40 hex chars each side)');
  }
  if (!isNonEmptyString(obj['description'])) {
    fail(sourcePath, '"description" must be a non-empty string');
  }

  return {
    id: obj['id'] as string,
    kind: obj['kind'] as MigrationKind,
    affectedAxes: obj['affectedAxes'] as string[],
    affectedGlobs: obj['affectedGlobs'] as string[],
    commitRange: obj['commitRange'] as string,
    description: obj['description'] as string,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "parseMigrationYaml"`
Expected: PASS (all 9 cases)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/package.json yarn.lock tools/create-icore/src/migrations/schema.ts tools/create-icore/src/migrations/__tests__/schema.unit.test.ts
git commit -m "feat(create-icore): add migration entry schema + .migration.yml parser"
```

---

### Task 3: Registry builder core (`build-registry.ts`)

**Files:**
- Create: `tools/create-icore/src/migrations/build-registry.ts`
- Create: `tools/create-icore/src/migrations/__tests__/build-registry.unit.test.ts`
- Modify: `tools/create-icore/package.json` (add `semver` + `@types/semver` devDependencies)
- Modify: `yarn.lock` (regenerated)

**Interfaces:**
- Consumes: `MigrationEntry`, `parseMigrationYaml` from Task 2 (`./schema.js`).
- Produces: `RegistryEntry` (`MigrationEntry & { version: string; diff: string }`), `RegistryFile { entries: RegistryEntry[] }`, `ChangesetRelease { name: string; type: 'major'|'minor'|'patch'|'none' }`, `ChangesetPair { slug, changesetPath: string|null, migrationYamlPath: string|null, migrationYamlRaw: string|null, changesetReleases: ChangesetRelease[] }`, `BuildRegistryDeps` interface, and `buildRegistry(deps: BuildRegistryDeps): Promise<RegistryFile>` — Task 4's `git-deps.ts` implements `BuildRegistryDeps` against these exact shapes, and Task 5's script calls `buildRegistry`.

- [ ] **Step 1: Add `semver` + types as devDependencies**

Edit `tools/create-icore/package.json`'s `devDependencies` to:

```json
"devDependencies": {
  "@types/js-yaml": "^4.0.9",
  "@types/semver": "^7.7.1",
  "js-yaml": "^4.1.1",
  "semver": "^7.8.1",
  "tsup": "^8.5.1",
  "vitest": "^4.1.9"
}
```

Run: `yarn install`
Expected: exits 0, `yarn.lock` updated to include `semver@^7.8.1` and `@types/semver@^7.7.1`.

- [ ] **Step 2: Write the failing test**

Create `tools/create-icore/src/migrations/__tests__/build-registry.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildRegistry,
  type BuildRegistryDeps,
  type ChangesetPair,
} from '../build-registry.js';

function makeDeps(
  overrides: Partial<BuildRegistryDeps> & { pairs: ChangesetPair[] },
): BuildRegistryDeps {
  const { pairs, ...rest } = overrides;
  return {
    listChangesetPairs: async () => pairs,
    codemodExists: async () => true,
    diffFiles: async () => ['some/file.ts'],
    diffText: async () => '--- a/some/file.ts\n+++ b/some/file.ts\n',
    currentVersion: async () => '0.12.2',
    loadExistingRegistry: async () => ({ entries: [] }),
    ...rest,
  };
}

const EXAMPLE_YAML = [
  'id: example-fix',
  'kind: codemod',
  'affectedAxes:',
  '  - "ui:mui"',
  'affectedGlobs:',
  '  - "apps/templates/client-mui/**"',
  'commitRange: "1234567..89abcde"',
  'description: "Example fix."',
].join('\n');

function basePair(over: Partial<ChangesetPair> = {}): ChangesetPair {
  return {
    slug: 'example',
    changesetPath: '.changeset/example.md',
    migrationYamlPath: '.changeset/example.migration.yml',
    migrationYamlRaw: EXAMPLE_YAML,
    changesetReleases: [{ name: '@idevconn/create-icore', type: 'patch' }],
    ...over,
  };
}

describe('buildRegistry', () => {
  it('adds a new codemod entry, stamped with the computed next version', async () => {
    const deps = makeDeps({ pairs: [basePair()] });
    const result = await buildRegistry(deps);
    expect(result.entries).toEqual([
      {
        id: 'example-fix',
        kind: 'codemod',
        affectedAxes: ['ui:mui'],
        affectedGlobs: ['apps/templates/client-mui/**'],
        commitRange: '1234567..89abcde',
        description: 'Example fix.',
        version: '0.12.3',
        diff: '--- a/some/file.ts\n+++ b/some/file.ts\n',
      },
    ]);
  });

  it('bumps minor when any changeset in the batch requests minor, even without a migration sibling', async () => {
    const deps = makeDeps({
      pairs: [
        basePair(),
        {
          slug: 'unrelated-feature',
          changesetPath: '.changeset/unrelated-feature.md',
          migrationYamlPath: null,
          migrationYamlRaw: null,
          changesetReleases: [{ name: '@idevconn/create-icore', type: 'minor' }],
        },
      ],
    });
    const result = await buildRegistry(deps);
    expect(result.entries[0].version).toBe('0.13.0');
  });

  it('skips a changeset with no migration sibling (no entry produced)', async () => {
    const deps = makeDeps({
      pairs: [
        {
          slug: 'docs-only',
          changesetPath: '.changeset/docs-only.md',
          migrationYamlPath: null,
          migrationYamlRaw: null,
          changesetReleases: [{ name: '@idevconn/create-icore', type: 'patch' }],
        },
      ],
    });
    const result = await buildRegistry(deps);
    expect(result.entries).toEqual([]);
  });

  it('throws on an orphan migration file with no matching changeset', async () => {
    const deps = makeDeps({
      pairs: [
        {
          slug: 'orphan',
          changesetPath: null,
          migrationYamlPath: '.changeset/orphan.migration.yml',
          migrationYamlRaw: EXAMPLE_YAML,
          changesetReleases: [],
        },
      ],
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Orphan migration file/);
  });

  it('throws on a duplicate id within the same batch', async () => {
    const deps = makeDeps({
      pairs: [
        basePair(),
        basePair({
          slug: 'example-2',
          changesetPath: '.changeset/example-2.md',
          migrationYamlPath: '.changeset/example-2.migration.yml',
        }),
      ],
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Duplicate migration id "example-fix"/);
  });

  it('throws on a duplicate id against the existing registry', async () => {
    const deps = makeDeps({
      pairs: [basePair()],
      loadExistingRegistry: async () => ({
        entries: [
          {
            id: 'example-fix',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '0000000..1111111',
            description: 'old',
            version: '0.1.0',
            diff: '',
          },
        ],
      }),
    });
    await expect(buildRegistry(deps)).rejects.toThrow(/Duplicate migration id "example-fix"/);
  });

  it('throws when affectedGlobs matches zero changed files', async () => {
    const deps = makeDeps({ pairs: [basePair()], diffFiles: async () => [] });
    await expect(buildRegistry(deps)).rejects.toThrow(/matched zero changed files/);
  });

  it('throws when a codemod-kind entry has no matching codemod file', async () => {
    const deps = makeDeps({ pairs: [basePair()], codemodExists: async () => false });
    await expect(buildRegistry(deps)).rejects.toThrow(/does not exist/);
  });

  it('does not require a codemod file for ai-prompt entries', async () => {
    const aiPromptYaml = EXAMPLE_YAML.replace('kind: codemod', 'kind: ai-prompt');
    const deps = makeDeps({
      pairs: [basePair({ migrationYamlRaw: aiPromptYaml })],
      codemodExists: async () => false,
    });
    const result = await buildRegistry(deps);
    expect(result.entries[0].kind).toBe('ai-prompt');
  });

  it('sorts merged entries by version ascending', async () => {
    const deps = makeDeps({
      pairs: [basePair()],
      loadExistingRegistry: async () => ({
        entries: [
          {
            id: 'older-entry',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '0000000..1111111',
            description: 'old',
            version: '0.5.0',
            diff: '',
          },
        ],
      }),
    });
    const result = await buildRegistry(deps);
    expect(result.entries.map((e) => e.id)).toEqual(['older-entry', 'example-fix']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `yarn nx test create-icore -t "buildRegistry"`
Expected: FAIL with "Cannot find module '../build-registry.js'"

- [ ] **Step 4: Implement `build-registry.ts`**

Create `tools/create-icore/src/migrations/build-registry.ts`:

```typescript
import semver from 'semver';
import { parseMigrationYaml, type MigrationEntry } from './schema.js';

export interface RegistryEntry extends MigrationEntry {
  version: string;
  diff: string;
}

export interface RegistryFile {
  entries: RegistryEntry[];
}

export interface ChangesetRelease {
  name: string;
  type: 'major' | 'minor' | 'patch' | 'none';
}

export interface ChangesetPair {
  /** Basename shared by the changeset and its optional migration sibling, e.g. "mui-9-2-icon-rename". */
  slug: string;
  /** Path to `.changeset/<slug>.md`, or null if only a `.migration.yml` exists with no matching changeset (orphan). */
  changesetPath: string | null;
  /** Path to `.changeset/<slug>.migration.yml`, or null if this changeset has no migration sibling. */
  migrationYamlPath: string | null;
  /** Raw text of the migration yaml, or null when migrationYamlPath is null. */
  migrationYamlRaw: string | null;
  /** This changeset's parsed `releases` (bump type per package); [] when changesetPath is null. */
  changesetReleases: ChangesetRelease[];
}

export interface BuildRegistryDeps {
  listChangesetPairs(): Promise<ChangesetPair[]>;
  codemodExists(id: string): Promise<boolean>;
  diffFiles(commitRange: string, globs: string[]): Promise<string[]>;
  diffText(commitRange: string, globs: string[]): Promise<string>;
  currentVersion(): Promise<string>;
  loadExistingRegistry(): Promise<RegistryFile>;
}

const PACKAGE_NAME = '@idevconn/create-icore';
const BUMP_RANK: Record<'major' | 'minor' | 'patch', number> = { major: 3, minor: 2, patch: 1 };

function highestBump(pairs: ChangesetPair[]): 'major' | 'minor' | 'patch' | null {
  let best: 'major' | 'minor' | 'patch' | null = null;
  for (const pair of pairs) {
    for (const release of pair.changesetReleases) {
      if (release.name !== PACKAGE_NAME || release.type === 'none') continue;
      if (!best || BUMP_RANK[release.type] > BUMP_RANK[best]) {
        best = release.type;
      }
    }
  }
  return best;
}

/**
 * Builds the migration registry from the current batch of pending changesets.
 * Must run before `changeset version` — see plan Global Constraints.
 */
export async function buildRegistry(deps: BuildRegistryDeps): Promise<RegistryFile> {
  const pairs = await deps.listChangesetPairs();
  const existing = await deps.loadExistingRegistry();
  const seenIds = new Set(existing.entries.map((e) => e.id));

  const bump = highestBump(pairs);
  const currentVersion = await deps.currentVersion();
  const nextVersion = bump ? semver.inc(currentVersion, bump) : currentVersion;
  if (bump && !nextVersion) {
    throw new Error(`Could not compute next version from "${currentVersion}" with bump "${bump}"`);
  }

  const newEntries: RegistryEntry[] = [];

  for (const pair of pairs) {
    if (pair.migrationYamlPath && !pair.changesetPath) {
      throw new Error(
        `Orphan migration file "${pair.migrationYamlPath}" has no matching changeset ".changeset/${pair.slug}.md"`,
      );
    }
    if (!pair.migrationYamlPath || pair.migrationYamlRaw === null) continue;

    const entry = parseMigrationYaml(pair.migrationYamlRaw, pair.migrationYamlPath);

    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate migration id "${entry.id}" (from "${pair.migrationYamlPath}")`);
    }
    seenIds.add(entry.id);

    if (entry.kind === 'codemod' && !(await deps.codemodExists(entry.id))) {
      throw new Error(
        `Migration "${entry.id}" is kind "codemod" but tools/create-icore/migrations/codemods/${entry.id}.ts does not exist`,
      );
    }

    const files = await deps.diffFiles(entry.commitRange, entry.affectedGlobs);
    if (files.length === 0) {
      throw new Error(
        `Migration "${entry.id}": affectedGlobs matched zero changed files over commitRange "${entry.commitRange}"`,
      );
    }

    const diff = await deps.diffText(entry.commitRange, entry.affectedGlobs);
    newEntries.push({ ...entry, version: nextVersion as string, diff });
  }

  const allEntries = [...existing.entries, ...newEntries].sort((a, b) =>
    semver.compare(a.version, b.version),
  );

  return { entries: allEntries };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn nx test create-icore -t "buildRegistry"`
Expected: PASS (all 10 cases)

- [ ] **Step 6: Commit**

```bash
git add tools/create-icore/package.json yarn.lock tools/create-icore/src/migrations/build-registry.ts tools/create-icore/src/migrations/__tests__/build-registry.unit.test.ts
git commit -m "feat(create-icore): add registry builder core (buildRegistry)"
```

---

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

### Task 5: Entrypoint script + `nx` target wiring

**Files:**
- Create: `tools/create-icore/scripts/build-migration-registry.ts`
- Modify: `tools/create-icore/project.json`

**Interfaces:**
- Consumes: `buildRegistry` (Task 3, `../src/migrations/build-registry.js`), `createGitDeps` (Task 4, `../src/migrations/git-deps.js`).
- Produces: `tools/create-icore/migrations/registry.json` (real, committed artifact) and an `nx` target other tooling/CI can depend on.

- [ ] **Step 1: Write the entrypoint script**

Create `tools/create-icore/scripts/build-migration-registry.ts`:

```typescript
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { buildRegistry } from '../src/migrations/build-registry.js';
import { createGitDeps } from '../src/migrations/git-deps.js';

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, '../../..');
  const deps = await createGitDeps(repoRoot);
  const registry = await buildRegistry(deps);
  const outPath = join(repoRoot, 'tools/create-icore/migrations/registry.json');
  await writeFile(outPath, JSON.stringify(registry, null, 2) + '\n');
  const count = registry.entries.length;
  console.log(`Wrote ${count} migration entr${count === 1 ? 'y' : 'ies'} to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Wire the `nx` target**

In `tools/create-icore/project.json`, add a new target alongside `snapshot-templates` and make `build` depend on it too:

```json
{
  "name": "create-icore",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "tools/create-icore/src",
  "projectType": "library",
  "tags": [],
  "targets": {
    "snapshot-templates": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node tools/create-icore/scripts/snapshot-templates.mjs"
      }
    },
    "build-migration-registry": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx tools/create-icore/scripts/build-migration-registry.ts"
      },
      "outputs": ["{projectRoot}/migrations/registry.json"]
    },
    "build": {
      "dependsOn": ["snapshot-templates", "build-migration-registry"],
      "executor": "nx:run-commands",
      "options": {
        "command": "tsup --config tools/create-icore/tsup.config.ts",
        "cwd": "tools/create-icore"
      },
      "outputs": ["{projectRoot}/dist", "{projectRoot}/templates"]
    },
    "lint": {
      "executor": "@nx/eslint:lint",
      "outputs": ["{options.outputFile}"]
    },
    "test": {
      "executor": "@nx/vitest:test",
      "outputs": ["{options.reportsDirectory}"],
      "options": {
        "reportsDirectory": "../../coverage/tools/create-icore"
      }
    }
  }
}
```

- [ ] **Step 3: Run the target for real and verify it produces an empty registry**

No `.migration.yml` files exist in the repo yet (backfilling real entries is explicitly out of scope for this plan), so this run should succeed with zero entries — proving the wiring works end-to-end without depending on any not-yet-authored content.

Run: `yarn nx run create-icore:build-migration-registry`
Expected: exits 0, prints `Wrote 0 migration entries to .../tools/create-icore/migrations/registry.json`

Run: `cat tools/create-icore/migrations/registry.json`
Expected:
```json
{
  "entries": []
}
```

- [ ] **Step 4: Run the full create-icore test suite to confirm nothing else broke**

Run: `yarn nx test create-icore`
Expected: PASS (all suites, including Tasks 1-4's new tests)

- [ ] **Step 5: Commit**

```bash
git add tools/create-icore/scripts/build-migration-registry.ts tools/create-icore/project.json tools/create-icore/migrations/registry.json
git commit -m "feat(create-icore): wire migration registry build script into nx build target"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (`generatorVersion`) → Task 1. §2 (sibling-file schema + parser) → Task 2. §3 (codemod convention) → enforced by Task 3's `codemodExists` check + Global Constraints note (no separate task needed — there's no codemod content to write yet, out of scope). §4 (build script + ordering) → Tasks 3-5. Error handling matrix → Task 3's 10 test cases + Task 4's real-git integration tests. Testing section → covered across all 4 test files. Out-of-scope items are not implemented anywhere in this plan.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `RegistryEntry`/`RegistryFile`/`ChangesetPair`/`ChangesetRelease`/`BuildRegistryDeps` are defined once in Task 3 and imported (never redefined) by Task 4 and Task 5's usage. `MigrationEntry`/`MigrationKind` defined once in Task 2, imported by Task 3.
