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
