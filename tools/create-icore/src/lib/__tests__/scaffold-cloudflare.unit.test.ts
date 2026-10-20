import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtemp, readFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.js';
import { auditProject } from '../../manifest/audit.js';

// Uses the real snapshot (`templates/`), which the `test` target refreshes via
// its `snapshot-templates` dependency — same approach as the PnP test in
// scaffold.integration.unit.test.ts. A fake fixture would not prove that the
// d1/r2 libs and provider wiring actually ship.
const realTemplatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates');

async function packageJsons(root: string): Promise<string[]> {
  const out = [join(root, 'package.json')];
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name === 'package.json') out.push(full);
    }
  }
  await walk(join(root, 'apps'));
  return out;
}

describe('scaffold — cloudflare d1 + r2 with supabase auth (real templates)', () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = join(await mkdtemp(join(tmpdir(), 'icore-cf-')), 'cf-app');
    await scaffold(
      {
        projectName: 'cf-app',
        targetDir: outDir,
        authProvider: 'supabase',
        dbProvider: 'd1',
        upload: 'r2',
        payment: 'none',
        jobs: 'none',
        ai: 'llm-router',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        session: 'redis',
        initGit: false,
        packageManager: 'yarn',
        install: false,
      },
      realTemplatesDir,
    );
  }, 120_000);

  it('wires the notes db provider to @icore/db-d1', async () => {
    const src = await readFile(
      join(outDir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-d1'");
  });

  it('wires the upload storage provider to @icore/storage-r2', async () => {
    const src = await readFile(
      join(outDir, 'apps/microservices/upload/src/app/storage.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/storage-r2'");
  });

  it('wires the ai-usage db provider to @icore/db-d1', async () => {
    const src = await readFile(
      join(outDir, 'apps/microservices/ai-orchestrator/src/app/ai-usage-db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-d1'");
  });

  it('keeps supabase auth but ships no supabase db/storage, minio or sqlite libs', async () => {
    await expect(access(join(outDir, 'libs/auth-strategies/supabase'))).resolves.toBeUndefined();
    for (const absent of [
      'libs/db-strategies/supabase',
      'libs/storage-strategies/supabase',
      'libs/storage-strategies/minio',
      'libs/db-strategies/sqlite',
    ]) {
      await expect(access(join(outDir, absent)), absent).rejects.toThrow();
    }
  });

  it('lists neither minio nor better-sqlite3 in any generated package.json', async () => {
    for (const pkgPath of await packageJsons(outDir)) {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(deps, pkgPath).not.toHaveProperty('minio');
      expect(deps, pkgPath).not.toHaveProperty('better-sqlite3');
    }
  });

  it('passes the manifest audit with no violations', async () => {
    expect(await auditProject(outDir)).toEqual([]);
  });
});
