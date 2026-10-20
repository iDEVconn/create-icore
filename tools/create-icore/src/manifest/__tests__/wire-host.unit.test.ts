import { describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreateIcoreOptions } from '../../lib/options.js';
import { renderHostedApps, workerSecrets, workerVars, writeHostWiring } from '../wire-host.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const opts: CreateIcoreOptions = {
  projectName: 'my-cf',
  host: 'cloudflare',
  targetDir: '/tmp/x',
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

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\/\/.*$/gm, '');

describe('renderHostedApps', () => {
  it('matches the committed apps/worker/src/hosted-apps.ts for the full feature set', async () => {
    const committed = await readFile(join(repoRoot, 'apps/worker/src/hosted-apps.ts'), 'utf8');
    // The lists are what matter: same modules, same services.
    for (const symbol of [
      'AuthModule',
      'AbilitiesModule',
      'ProfileModule',
      'StorageModule',
      'NotesModule',
      'AuthMsModule',
      'UploadMsModule',
      'NotesMsModule',
    ])
      expect(committed).toContain(symbol);
    expect(renderHostedApps(opts)).toContain(
      '[AuthModule, AbilitiesModule, ProfileModule, StorageModule, NotesModule]',
    );
  });

  it('drops what the project does not have', () => {
    const src = renderHostedApps({ ...opts, upload: 'none', example: 'none' });
    expect(src).toContain('[AuthModule, AbilitiesModule, ProfileModule]');
    expect(code(src)).not.toMatch(/Storage|Notes|UploadMs/);
    expect(src).toContain('FEATURES_REGISTER_THROTTLER_GUARD = true');
  });

  it('without auth nothing auth-related is hosted and the Worker registers the throttler guard', () => {
    const src = renderHostedApps({
      ...opts,
      authProvider: 'none',
      dbProvider: 'none',
      example: 'none',
      session: 'redis',
    });
    expect(src).toContain('[StorageModule]');
    expect(code(src)).not.toMatch(/AuthModule|AbilitiesModule|ProfileModule|AuthMs/);
    expect(src).toContain('FEATURES_REGISTER_THROTTLER_GUARD = false');
  });

  it('with nothing hosted the lists are empty but valid', () => {
    const src = renderHostedApps({
      ...opts,
      authProvider: 'none',
      upload: 'none',
      example: 'none',
      dbProvider: 'none',
    });
    expect(src).toContain('GATEWAY_FEATURE_MODULES: Type<unknown>[] = []');
    expect(src).toMatch(/MICROSERVICES: \{[^}]*\}\[\] = \[\s*\]/);
  });
});

describe('workerVars / workerSecrets', () => {
  it('sets a local transport per hosted microservice and the durable-object session store', () => {
    expect(workerVars(opts)).toMatchObject({
      SESSION_STORE: 'durable-object',
      AUTH_TRANSPORT: 'local',
      UPLOAD_TRANSPORT: 'local',
      NOTES_TRANSPORT: 'local',
      R2_BUCKET: 'uploads',
    });
    const none = workerVars({ ...opts, upload: 'none', example: 'none' });
    expect(Object.keys(none)).not.toContain('UPLOAD_TRANSPORT');
    expect(Object.keys(none)).not.toContain('NOTES_TRANSPORT');
  });

  it('lists the secrets a deployed Worker needs and never contains a value', () => {
    expect(workerSecrets(opts)).toEqual([
      'AUTH_TCP_SECRET',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ]);
    expect(workerSecrets({ ...opts, authProvider: 'none', upload: 'none' })).toEqual([]);
  });
});

describe('writeHostWiring', () => {
  async function fixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-wire-host-'));
    await cp(join(repoRoot, 'apps/worker'), join(dir, 'apps/worker'), {
      recursive: true,
      filter: (p) => !/\/(build|node_modules|\.wrangler)(\/|$)/.test(p),
    });
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { dev: 'nx run-many -t serve', build: 'x' } }),
    );
    return dir;
  }

  it('is a no-op for the Node host', async () => {
    const dir = await fixture();
    const before = await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8');
    await writeHostWiring(dir, { ...opts, host: 'node' });
    expect(await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8')).toBe(before);
  });

  it('rewrites hosted apps, wrangler vars + D1 binding, secrets template, dev port and dev script', async () => {
    const dir = await fixture();
    await writeHostWiring(dir, opts);
    const wrangler = await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8');
    expect(wrangler).toContain('"name": "my-cf"');
    expect(wrangler).toContain('"binding": "DB"');
    expect(wrangler).toContain('"database_name": "my-cf"');
    expect(wrangler).toContain('"NOTES_TRANSPORT": "local"');
    expect(wrangler).toContain('"alias"'); // untouched sections survive
    expect(wrangler).toContain('SessionDurableObject');
    expect(await readFile(join(dir, 'apps/worker/.dev.vars.example'), 'utf8')).toContain(
      'AUTH_TCP_SECRET=',
    );
    expect(await readFile(join(dir, 'apps/worker/project.json'), 'utf8')).toContain(
      'wrangler dev --local --port 3001',
    );
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(pkg.scripts.dev).toContain('-p worker client');
    expect(pkg.scripts.build).toBe('x');
  });

  it('adds no D1 binding when the notes demo is not included', async () => {
    const dir = await fixture();
    await writeHostWiring(dir, { ...opts, example: 'none' });
    expect(await readFile(join(dir, 'apps/worker/wrangler.jsonc'), 'utf8')).not.toContain(
      'd1_databases',
    );
  });
});
