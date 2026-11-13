import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.js';
import { auditProject } from '../../manifest/audit.js';
import type { CreateIcoreOptions } from '../options.js';

// Real snapshot (`templates/`), like scaffold-cloudflare.unit.test.ts: a fake fixture could not prove
// that no client file, alias or script reference survives.
const realTemplatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates');

const base: CreateIcoreOptions = {
  projectName: 'api-only',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  ai: 'none',
  example: 'notes',
  ui: 'none',
  transport: 'tcp',
  session: 'redis',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

async function generate(over: Partial<CreateIcoreOptions>): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), 'icore-ui-none-')), 'api-only');
  await scaffold({ ...base, ...over, targetDir: outDir }, realTemplatesDir);
  return outDir;
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

describe.each([
  ['auth=supabase + example=notes', {}],
  ['auth=none + upload=none', { authProvider: 'none', upload: 'none', dbProvider: 'none' }],
] as const)('scaffold ui=none (%s)', (_label, over) => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await generate(over);
  }, 120_000);

  it('generates the project without any client artifact', async () => {
    for (const p of [
      'apps/client',
      'apps/templates',
      'Dockerfile.client',
      'nginx.client.conf',
      'libs/template-shared',
      'libs/vite-plugins',
    ]) {
      expect(await exists(join(outDir, p)), p).toBe(false);
    }
    expect(await exists(join(outDir, 'apps/api'))).toBe(true);
  });

  it('leaves no client path alias in tsconfig.base.json', async () => {
    const tsconfig = await readFile(join(outDir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('template-shared');
    expect(tsconfig).not.toContain('vite-plugins');
    expect(() => JSON.parse(tsconfig)).not.toThrow();
  });

  it('does not advertise a client in the README', async () => {
    const readme = await readFile(join(outDir, 'README.md'), 'utf8');
    expect(readme).not.toContain('localhost:4200');
    expect(readme).not.toContain('apps/client');
  });

  it('records ui=none in blueprint.json and writes no client blueprint', async () => {
    const bp = JSON.parse(await readFile(join(outDir, 'blueprint.json'), 'utf8')) as {
      ui: string;
    };
    expect(bp.ui).toBe('none');
    expect(await exists(join(outDir, 'apps/client/blueprint.json'))).toBe(false);
  });

  it('drops client-only dependencies from the root package.json', async () => {
    const pkg = JSON.parse(await readFile(join(outDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const gone of [
      'react',
      'react-dom',
      'zustand',
      '@vitejs/plugin-react',
      '@icore/vite-plugins',
    ]) {
      expect(all, gone).not.toContain(gone);
    }
    expect(all).toContain('@nestjs/core');
  });

  it('passes the dangling-import audit', async () => {
    const findings = await auditProject(outDir);
    expect(findings).toEqual([]);
  });

  it('keeps the gateway app', async () => {
    const apps = await readdir(join(outDir, 'apps'));
    expect(apps).toContain('api');
    expect(apps).not.toContain('client');
  });
});
