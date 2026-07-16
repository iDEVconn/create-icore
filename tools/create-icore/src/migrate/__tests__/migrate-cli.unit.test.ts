import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runMigrateCli } from '../migrate-cli.js';
import type { RegistryFile } from '../../migrations/build-registry.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

describe('runMigrateCli', () => {
  it('resolves --to=latest to the highest registry version instead of crashing on the literal string', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'icore-migrate-cli-proj-'));
    const packageRoot = await mkdtemp(join(tmpdir(), 'icore-migrate-cli-pkgroot-'));

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

      // Real registry fixture, mirroring what loadRegistry() reads from
      // <packageRoot>/migrations/registry.json.
      const registry: RegistryFile = {
        entries: [
          {
            id: 'bump-a-value',
            kind: 'codemod',
            affectedAxes: ['ui:mui'],
            affectedGlobs: ['x/**'],
            commitRange: '1234567..89abcde',
            description: 'Bump a value',
            version: '0.5.0',
            diff: '',
          },
        ],
      };
      await mkdir(join(packageRoot, 'migrations'), { recursive: true });
      await writeFile(
        join(packageRoot, 'migrations', 'registry.json'),
        JSON.stringify(registry, null, 2) + '\n',
      );

      await mkdir(join(packageRoot, 'dist', 'migrations', 'codemods'), { recursive: true });
      await writeFile(
        join(packageRoot, 'dist', 'migrations', 'codemods', 'bump-a-value.js'),
        `import { writeFile } from 'node:fs/promises';\n` +
          `import { join } from 'node:path';\n` +
          `export default async function (projectDir) {\n` +
          `  await writeFile(join(projectDir, 'bumped.txt'), 'yes');\n` +
          `}\n`,
      );

      await expect(
        runMigrateCli(['--to=latest'], projectDir, packageRoot),
      ).resolves.toBeUndefined();

      const blueprintAfter = JSON.parse(await readFile(join(projectDir, 'blueprint.json'), 'utf8'));
      // '--to=latest' must resolve via highestVersion(registry), i.e. '0.5.0' —
      // not be passed through to semver.lte() as the literal string 'latest'.
      expect(blueprintAfter.generatorVersion).toBe('0.5.0');
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(packageRoot, { recursive: true, force: true });
    }
  });
});
