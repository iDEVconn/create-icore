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

`semver` is imported by real source (`build-registry.ts`) but — like `js-yaml` in Task 2 — is build-tooling-only: `tools/create-icore/tsup.config.ts` never bundles `src/migrations/**` into the published package (only `src/cli.ts`, `src/manifest/audit.ts`, `src/index.ts` are entries), so this never ships to or runs for `create-icore` end-users. Add it to the same `ignoredDependencies` allowlist `tools/create-icore/eslint.config.mjs` already uses for `tsup`/`vitest`/`js-yaml`:

```js
ignoredDependencies: ['tsup', 'vitest', 'js-yaml', 'semver'],
```

Run: `yarn nx lint create-icore`
Expected: 0 errors

- [ ] **Step 2: Write the failing test**

Create `tools/create-icore/src/migrations/__tests__/build-registry.unit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildRegistry, type BuildRegistryDeps, type ChangesetPair } from '../build-registry.js';

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
