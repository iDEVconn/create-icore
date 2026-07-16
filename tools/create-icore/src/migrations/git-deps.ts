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
