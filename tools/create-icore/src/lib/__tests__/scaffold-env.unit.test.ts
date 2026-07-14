import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeClientEnv } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-clientenv-'));
  await mkdir(join(dir, 'apps/client'), { recursive: true });
  // Mirrors the real apps/templates/client-shadcn/.env.example shape: the
  // placeholder VITE_AUTH_HAS_OAUTH / VITE_AUTH_HAS_MAGIC_LINK lines already
  // exist (defaulted to false) with an explanatory comment above them.
  await writeFile(
    join(dir, 'apps/client/.env.example'),
    'VITE_API_URL=/api\n\n' +
      '# Set by the generator based on --auth=<provider>. Gates OAuth buttons + the\n' +
      "# magic-link toggle in LoginForm — postgres/mongodb don't implement either yet.\n" +
      'VITE_AUTH_HAS_OAUTH=false\n' +
      'VITE_AUTH_HAS_MAGIC_LINK=false\n',
  );
  return dir;
}

// Counts how many times a KEY= assignment line appears in the file. Used to
// prove writeClientEnv REPLACES the placeholder line in .env.example rather
// than appending a second, contradictory one — a `toContain` check alone
// passes even when both a `false` and a `true` line are both present.
function countAssignments(text: string, key: string): number {
  return (text.match(new RegExp(`^${key}=`, 'gm')) ?? []).length;
}

const baseOpts = { authProvider: 'postgres' } as CreateIcoreOptions;

describe('writeClientEnv', () => {
  it('sets VITE_AUTH_HAS_OAUTH / VITE_AUTH_HAS_MAGIC_LINK to false for postgres (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'postgres' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(countAssignments(env, 'VITE_AUTH_HAS_OAUTH')).toBe(1);
    expect(countAssignments(env, 'VITE_AUTH_HAS_MAGIC_LINK')).toBe(1);
    expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=false$/m);
    expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=false$/m);
  });

  it('sets both flags to false for mongodb (not implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'mongodb' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(countAssignments(env, 'VITE_AUTH_HAS_OAUTH')).toBe(1);
    expect(countAssignments(env, 'VITE_AUTH_HAS_MAGIC_LINK')).toBe(1);
    expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=false$/m);
    expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=false$/m);
  });

  it('sets both flags to true for supabase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'supabase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(countAssignments(env, 'VITE_AUTH_HAS_OAUTH')).toBe(1);
    expect(countAssignments(env, 'VITE_AUTH_HAS_MAGIC_LINK')).toBe(1);
    expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=true$/m);
    expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=true$/m);
  });

  it('sets both flags to true for firebase (implemented)', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(countAssignments(env, 'VITE_AUTH_HAS_OAUTH')).toBe(1);
    expect(countAssignments(env, 'VITE_AUTH_HAS_MAGIC_LINK')).toBe(1);
    expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=true$/m);
    expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=true$/m);
  });
});
