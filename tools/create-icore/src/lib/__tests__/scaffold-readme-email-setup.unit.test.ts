import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAiFiles } from '../scaffold-pkg.js';
import type { CreateIcoreOptions } from '../options.js';

async function readmeFor(authProvider: CreateIcoreOptions['authProvider']): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-readme-'));
  await writeAiFiles(dir, {
    projectName: 'demo',
    packageManager: 'yarn',
    ui: 'shadcn',
    authProvider,
    dbProvider: 'none',
    upload: 'none',
    transport: 'tcp',
    payment: 'none',
    jobs: 'none',
    ai: 'none',
    example: 'none',
  } as CreateIcoreOptions);
  return readFile(join(dir, 'README.md'), 'utf8');
}

describe('generated README — provider email setup', () => {
  it('documents the Supabase Site URL / Redirect URLs step', async () => {
    const readme = await readmeFor('supabase');
    expect(readme).toContain('## Provider setup (email links)');
    expect(readme).toContain('Site URL');
  });

  it('has no such section for postgres', async () => {
    expect(await readmeFor('postgres')).not.toContain('Provider setup (email links)');
  });
});
