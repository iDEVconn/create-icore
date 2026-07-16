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
