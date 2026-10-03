import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAiFiles } from '../scaffold-pkg.js';
import type { CreateIcoreOptions } from '../options.js';

async function readmeFor(
  session: CreateIcoreOptions['session'],
  authProvider: CreateIcoreOptions['authProvider'] = 'supabase',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-readme-session-'));
  await writeAiFiles(dir, {
    projectName: 'demo',
    packageManager: 'yarn',
    ui: 'shadcn',
    authProvider,
    dbProvider: 'none',
    upload: 'none',
    transport: 'tcp',
    session,
    payment: 'none',
    jobs: 'none',
    ai: 'none',
    example: 'none',
  } as CreateIcoreOptions);
  return readFile(join(dir, 'README.md'), 'utf8');
}

describe('generated README — session store', () => {
  it('memory: explains the trade-offs and how to switch back', async () => {
    const readme = await readmeFor('memory');
    expect(readme).toContain('## Session store');
    expect(readme).toContain('SESSION_STORE=memory');
    expect(readme).toContain('ONE gateway instance');
    expect(readme).toContain('restart');
    expect(readme).toContain('SESSION_REDIS_URL');
  });

  it('redis: points at SESSION_REDIS_URL and never claims in-memory sessions', async () => {
    const readme = await readmeFor('redis');
    expect(readme).toContain('## Session store');
    expect(readme).toContain('SESSION_REDIS_URL');
    expect(readme).not.toContain('SESSION_STORE=memory');
  });

  it('auth=none: no section (there are no sessions)', async () => {
    expect(await readmeFor('memory', 'none')).not.toContain('## Session store');
  });
});
