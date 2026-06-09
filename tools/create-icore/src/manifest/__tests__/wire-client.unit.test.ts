import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeNavConfig } from '../wire-client.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-nav-'));
  await mkdir(join(dir, 'apps/client/src'), { recursive: true });
  return dir;
}

describe('writeNavConfig', () => {
  it('includes the notes entry when example=notes', async () => {
    const dir = await fixture();
    await writeNavConfig(dir, { ...base, targetDir: dir, example: 'notes' });
    const src = await readFile(join(dir, 'apps/client/src/nav.config.ts'), 'utf8');
    expect(src).toContain(
      "{ to: '/dashboard', labelKey: 'nav.dashboard', iconName: 'dashboard', exact: true }",
    );
    expect(src).toContain("{ to: '/notes', labelKey: 'nav.notes', iconName: 'notes' }");
    expect(src).toContain("{ to: '/profile', labelKey: 'nav.profile', iconName: 'profile' }");
    expect(src).toContain('export interface NavItem');
  });

  it('omits the notes entry when example=none', async () => {
    const dir = await fixture();
    await writeNavConfig(dir, { ...base, targetDir: dir, example: 'none' });
    const src = await readFile(join(dir, 'apps/client/src/nav.config.ts'), 'utf8');
    expect(src).not.toContain("'/notes'");
    expect(src).toContain("iconName: 'dashboard'");
    expect(src).toContain("iconName: 'profile'");
  });
});
