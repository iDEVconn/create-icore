import { describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.js';
import type { CreateIcoreOptions } from '../options.js';

// Real snapshot (`templates/`, refreshed by the `test` target's snapshot-templates dependency).
const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates');

const cf: CreateIcoreOptions = {
  projectName: 'cf-app',
  host: 'cloudflare',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'd1',
  upload: 'r2',
  payment: 'none',
  jobs: 'none',
  ai: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'local',
  session: 'durable-object',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

async function gen(over: Partial<CreateIcoreOptions>): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'icore-host-cf-')), 'cf-app');
  await scaffold({ ...cf, ...over, targetDir: dir }, templatesDir);
  return dir;
}

describe('scaffold — host=cloudflare (real templates)', () => {
  it('ships the Worker app with its features, bindings and secrets template', async () => {
    const dir = await gen({});
    expect(await exists(join(dir, 'apps/worker/src/index.ts'))).toBe(true);
    const hosted = await readFile(join(dir, 'apps/worker/src/hosted-apps.ts'), 'utf8');
    expect(hosted).toContain('NotesMsModule');
    const wrangler = await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8');
    expect(wrangler).toContain('"SESSION_STORE": "durable-object"');
    expect(wrangler).toContain('"d1_databases"');
    expect(await exists(join(dir, 'apps/worker/.dev.vars.example'))).toBe(true);
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.dev).toContain('-p worker client');
    // the strategies the Worker uses are the d1/r2 ones, and no other provider ships
    expect(await exists(join(dir, 'libs/db-strategies/d1'))).toBe(true);
    expect(await exists(join(dir, 'libs/storage-strategies/r2'))).toBe(true);
    expect(await exists(join(dir, 'libs/db-strategies/supabase'))).toBe(false);
  }, 120_000);

  it('has no containers, compose file or nginx', async () => {
    const dir = await gen({});
    for (const f of [
      'Dockerfile.gateway',
      'Dockerfile.ms-auth',
      'Dockerfile.client',
      'docker-compose.yml',
      'nginx.client.conf',
    ])
      expect(await exists(join(dir, f))).toBe(false);
  }, 120_000);

  it('leaves out microservices the project does not have', async () => {
    const dir = await gen({ upload: 'none', example: 'none', dbProvider: 'none' });
    const hosted = await readFile(join(dir, 'apps/worker/src/hosted-apps.ts'), 'utf8');
    expect(hosted).not.toMatch(/UploadMs|NotesMs/);
    expect(await exists(join(dir, 'apps/microservices/upload'))).toBe(false);
    expect(await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8')).not.toContain(
      'd1_databases',
    );
  }, 120_000);

  it('does not ship the Worker for the Node host', async () => {
    const dir = await gen({
      host: 'node',
      transport: 'tcp',
      session: 'redis',
      dbProvider: 'supabase',
      upload: 'supabase',
    });
    expect(await exists(join(dir, 'apps/worker'))).toBe(false);
    expect(await exists(join(dir, 'Dockerfile.gateway'))).toBe(true);
  }, 120_000);

  it('refuses an unsupported combination before writing anything', async () => {
    const dir = join(await mkdtemp(join(tmpdir(), 'icore-host-cf-')), 'cf-app');
    await expect(
      scaffold({ ...cf, authProvider: 'firebase', targetDir: dir }, templatesDir),
    ).rejects.toThrow(/--host=cloudflare does not support --auth=firebase/);
    expect(await exists(dir)).toBe(false);
  }, 120_000);
});
