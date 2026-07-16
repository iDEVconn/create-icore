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
