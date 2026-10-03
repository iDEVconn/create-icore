import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeClientEnv, writeGatewayEnv } from '../scaffold-env.js';
import type { CreateIcoreOptions } from '../options.js';

// Mirrors the exact pattern already used in scaffold.unit.test.ts:976 for reading
// real repo files from a test (not a synthetic fixture).
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

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
      'VITE_AUTH_HAS_MAGIC_LINK=false\n' +
      'VITE_AUTH_HAS_PASSWORD_RESET=false\n',
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

  it.each([
    ['supabase', 'true'],
    ['firebase', 'true'],
    ['postgres', 'false'],
    ['mongodb', 'false'],
  ] as const)('%s → VITE_AUTH_HAS_PASSWORD_RESET=%s', async (provider, value) => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: provider });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(countAssignments(env, 'VITE_AUTH_HAS_PASSWORD_RESET')).toBe(1);
    expect(env).toMatch(new RegExp(`^VITE_AUTH_HAS_PASSWORD_RESET=${value}$`, 'm'));
  });

  // antd/mui now ship an AuthBootstrap component (parity with client-shadcn)
  // that resolves the session cookie on mount, so a completed OAuth redirect
  // to /dashboard is picked up correctly and OAuth follows the same
  // auth-provider capability rule as every other UI template.
  it.each(['antd', 'mui', 'shadcn'] as const)(
    'sets VITE_AUTH_HAS_OAUTH=true for %s on an OAuth-capable provider (AuthBootstrap makes the redirect flow work)',
    async (ui) => {
      const dir = await fixture();
      await writeClientEnv(dir, { ...baseOpts, authProvider: 'supabase', ui });
      const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
      expect(countAssignments(env, 'VITE_AUTH_HAS_OAUTH')).toBe(1);
      expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=true$/m);
      expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=true$/m);
    },
  );

  it('keeps OAuth off for antd on a provider that does not implement it either', async () => {
    const dir = await fixture();
    await writeClientEnv(dir, { ...baseOpts, authProvider: 'postgres', ui: 'antd' });
    const env = await readFile(join(dir, 'apps/client/.env'), 'utf8');
    expect(env).toMatch(/^VITE_AUTH_HAS_OAUTH=false$/m);
    expect(env).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=false$/m);
  });
});

describe('writeClientEnv — real template .env.example files have the VITE_AUTH_HAS_* placeholder', () => {
  it.each(['client-shadcn', 'client-mui', 'client-antd'])(
    '%s/.env.example has both placeholder lines writeClientEnv depends on',
    async (uiTemplate) => {
      const envExample = await readFile(
        join(repoRoot, `apps/templates/${uiTemplate}/.env.example`),
        'utf8',
      );
      expect(envExample).toMatch(/^VITE_AUTH_HAS_OAUTH=.*$/m);
      expect(envExample).toMatch(/^VITE_AUTH_HAS_MAGIC_LINK=.*$/m);
    },
  );
});

describe('writeGatewayEnv — session store', () => {
  const mk = async (session: 'redis' | 'memory') => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-gwenv-'));
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/.env.example'),
      'AUTH_TRANSPORT=tcp\nSESSION_REDIS_URL=redis://localhost:6379\n',
    );
    await writeGatewayEnv(dir, {
      authProvider: 'supabase',
      transport: 'tcp',
      session,
    } as CreateIcoreOptions);
    return readFile(join(dir, 'apps/api/.env'), 'utf8');
  };

  it('session=memory swaps SESSION_REDIS_URL for SESSION_STORE=memory; redis leaves it', async () => {
    const mem = await mk('memory');
    expect(mem).toContain('SESSION_STORE=memory');
    expect(mem).not.toContain('SESSION_REDIS_URL');
    const redis = await mk('redis');
    expect(redis).toContain('SESSION_REDIS_URL=redis://localhost:6379');
    expect(redis).not.toContain('SESSION_STORE=');
  });
});
