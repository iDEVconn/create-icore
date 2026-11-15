import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts');
const { listSnapshotFiles, filesUnder } = (await import(join(scripts, 'snapshot-files.mjs'))) as {
  listSnapshotFiles: (root: string) => string[];
  filesUnder: (all: string[], rel: string) => string[];
};

// templates/ is what `npm pack` publishes: a gitignored local file (secrets, agent state) copied
// into it would ship. The snapshot therefore copies only what git itself knows.
describe('listSnapshotFiles', () => {
  let root: string;
  const put = async (rel: string, body = 'x') => {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), body);
  };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'icore-snap-'));
    git('init', '-q');
    await put('.gitignore', '.env\nruvector.db\n.claude-flow/\ntmp\n');
    await put('apps/api/src/main.ts');
    await put('apps/api/.env.example');
    await put('apps/api/gone.ts');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');
    await rm(join(root, 'apps/api/gone.ts'));
    await put('apps/api/.env', 'SECRET=1');
    await put('apps/api/ruvector.db');
    await put('apps/api/.claude-flow/state.json');
    await put('apps/api/tmp/cache.txt');
    await put('apps/api/src/new-untracked.ts');
  });

  afterAll(() => rm(root, { recursive: true, force: true }));

  it('lists tracked files and untracked-but-not-ignored files', () => {
    const files = listSnapshotFiles(root);
    expect(files).toEqual(
      expect.arrayContaining([
        '.gitignore',
        'apps/api/src/main.ts',
        'apps/api/.env.example',
        'apps/api/src/new-untracked.ts',
      ]),
    );
  });

  it('never lists gitignored local files (.env, agent state, tmp)', () => {
    const files = listSnapshotFiles(root);
    for (const leaked of [
      'apps/api/.env',
      'apps/api/ruvector.db',
      'apps/api/.claude-flow/state.json',
      'apps/api/tmp/cache.txt',
    ]) {
      expect(files, leaked).not.toContain(leaked);
    }
  });

  it('skips a tracked file deleted from the working tree', () => {
    expect(listSnapshotFiles(root)).not.toContain('apps/api/gone.ts');
  });

  it('filesUnder matches a directory prefix and an exact file, not a sibling', () => {
    const all = ['apps/api/a.ts', 'apps/api-e2e/b.ts', 'nx.json', 'nx.json.bak'];
    expect(filesUnder(all, 'apps/api')).toEqual(['apps/api/a.ts']);
    expect(filesUnder(all, 'nx.json')).toEqual(['nx.json']);
  });
});
