import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeClientEnv } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-clientenv-'));
  await mkdir(join(dir, 'apps/client'), { recursive: true });
  await writeFile(join(dir, 'apps/client/.env.example'), 'VITE_API_URL=/api\n');
  return dir;
}

const baseOpts = { authProvider: 'postgres' } as CreateIcoreOptions;

describe('writeClientEnv', () => {
  it('sets VITE_AUTH_HAS_OAUTH / VITE_AUTH_HAS_MAGIC_LINK to false for postgres (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'postgres' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=false');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=false');
  });

  it('sets both flags to false for mongodb (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'mongodb' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=false');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=false');
  });

  it('sets both flags to true for supabase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'supabase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=true');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=true');
  });

  it('sets both flags to true for firebase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toContain('VITE_AUTH_HAS_OAUTH=true');
    expect(env).toContain('VITE_AUTH_HAS_MAGIC_LINK=true');
  });
});
