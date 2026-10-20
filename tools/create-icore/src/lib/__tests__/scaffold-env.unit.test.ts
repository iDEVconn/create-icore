import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  writeClientEnv,
  writeGatewayEnv,
  writeUploadEnv,
  writeNotesEnv,
  pruneRootProviderDeps,
} from '../scaffold-env.js';
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

describe('Cloudflare env blocks (writeUploadEnv r2 / writeNotesEnv d1)', () => {
  const cfOpts = {
    authProvider: 'supabase',
    dbProvider: 'supabase',
    upload: 'supabase',
    example: 'notes',
    transport: 'tcp',
  } as CreateIcoreOptions;

  async function msFixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-cf-env-'));
    await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
    await mkdir(join(dir, 'apps/microservices/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/.env.example'),
      'UPLOAD_TRANSPORT=tcp\nSTORAGE_PROVIDER=supabase\n',
    );
    await writeFile(
      join(dir, 'apps/microservices/notes/.env.example'),
      'NOTES_TRANSPORT=tcp\nDB_PROVIDER=supabase\n',
    );
    return dir;
  }

  const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const D1_KEYS = ['D1_ACCOUNT_ID', 'D1_DATABASE_ID', 'D1_API_TOKEN'];

  it('writeUploadEnv with upload=r2 selects r2 and appends the four R2_* keys', async () => {
    const dir = await msFixture();
    await writeUploadEnv(dir, { ...cfOpts, upload: 'r2' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).toMatch(/^STORAGE_PROVIDER=r2$/m);
    for (const k of R2_KEYS) expect(countAssignments(env, k)).toBe(1);
  });

  it('writeUploadEnv with another provider appends no R2_* keys', async () => {
    const dir = await msFixture();
    await writeUploadEnv(dir, { ...cfOpts, upload: 'supabase' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).not.toContain('R2_');
  });

  it('writeNotesEnv with dbProvider=d1 appends the three D1_* keys', async () => {
    const dir = await msFixture();
    await writeNotesEnv(dir, { ...cfOpts, dbProvider: 'd1' });
    const env = await readFile(join(dir, 'apps/microservices/notes/.env'), 'utf8');
    for (const k of D1_KEYS) expect(countAssignments(env, k)).toBe(1);
  });

  it('writeNotesEnv with another db provider appends no D1_* keys', async () => {
    const dir = await msFixture();
    await writeNotesEnv(dir, { ...cfOpts, dbProvider: 'sqlite' });
    const env = await readFile(join(dir, 'apps/microservices/notes/.env'), 'utf8');
    expect(env).not.toContain('D1_');
  });
});

describe('pruneRootProviderDeps — Cloudflare R2 AWS SDK', () => {
  async function rootPkgFixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-cf-prune-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@aws-sdk/client-s3': '^3.1153.0',
          '@aws-sdk/s3-request-presigner': '^3.1153.0',
          minio: '^8.0.6',
        },
      }),
    );
    return dir;
  }
  const opts = (upload: CreateIcoreOptions['upload']) =>
    ({ authProvider: 'supabase', dbProvider: 'd1', upload }) as CreateIcoreOptions;

  it('drops both AWS SDK packages when upload is not r2', async () => {
    const dir = await rootPkgFixture();
    await pruneRootProviderDeps(dir, opts('supabase'));
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('@aws-sdk/client-s3');
    expect(pkg.dependencies).not.toHaveProperty('@aws-sdk/s3-request-presigner');
  });

  it('keeps both AWS SDK packages (and drops minio) when upload is r2', async () => {
    const dir = await rootPkgFixture();
    await pruneRootProviderDeps(dir, opts('r2'));
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@aws-sdk/client-s3']).toBe('^3.1153.0');
    expect(pkg.dependencies['@aws-sdk/s3-request-presigner']).toBe('^3.1153.0');
    expect(pkg.dependencies).not.toHaveProperty('minio');
  });
});
