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
    await writeFile(
      join(repoRoot, 'apps/templates/client-mui/src/Icon.tsx'),
      'export const Icon = 1;\n',
    );
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
