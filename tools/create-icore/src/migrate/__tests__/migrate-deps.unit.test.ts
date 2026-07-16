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
