import { describe, expect, it } from 'vitest';
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scaffold } from '../scaffold.js';
import { auditProject } from '../../manifest/audit.js';
import type { CreateIcoreOptions } from '../options.js';

// tools/remove-notes.mjs ships with the notes example. Its file transformation (everything except
// the `nx g @nx/workspace:remove` calls, which need an installed workspace) runs here against real
// scaffolds of each api mode and must leave the gateway without a reference to notes.
const here = dirname(fileURLToPath(import.meta.url));
const realTemplatesDir = resolve(here, '../../../templates');
const repoRoot = resolve(here, '../../../../..');

const base: CreateIcoreOptions = {
  projectName: 'rm-notes',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  ai: 'none',
  example: 'notes',
  ui: 'shadcn',
  api: 'rest',
  transport: 'tcp',
  session: 'redis',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

type RemoveNotes = { removeNotesFiles: (root: string) => Promise<void> };

async function scaffoldAndRemoveNotes(
  api: CreateIcoreOptions['api'],
  ui: CreateIcoreOptions['ui'] = 'shadcn',
): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), 'icore-rm-notes-')), 'rm-notes');
  await scaffold({ ...base, api, ui, targetDir: outDir }, realTemplatesDir);
  const script = join(outDir, 'tools/remove-notes.mjs');
  const mod = (await import(pathToFileURL(script).href)) as RemoveNotes;
  await mod.removeNotesFiles(outDir);
  return outDir;
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Gateway sources that still name a notes symbol or import a missing relative file. */
async function notesLeftovers(outDir: string): Promise<string[]> {
  const out: string[] = [];
  for (const root of ['apps/api/src', 'apps/api/scripts']) {
    if (!existsSync(join(outDir, root))) continue;
    for (const file of await walk(join(outDir, root))) {
      const src = await readFile(file, 'utf8');
      const rel = relative(outDir, file);
      if (/\bNotes\w*(Module|Resolver)\b|notes-client|['/]notes\//.test(src)) out.push(rel);
      for (const m of src.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
        const target = resolve(dirname(file), m[1] as string);
        if (!['', '.ts', '/index.ts'].some((ext) => existsSync(target + ext)))
          out.push(`${rel} -> ${m[1]}`);
      }
    }
  }
  return out;
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

describe.each(['rest', 'graphql', 'both'] as const)('remove-notes on an api=%s project', (api) => {
  it('leaves no reference to notes in the gateway', async () => {
    const outDir = await scaffoldAndRemoveNotes(api);
    expect(await exists(join(outDir, 'apps/api/src/app/notes'))).toBe(false);
    expect(await notesLeftovers(outDir)).toEqual([]);
    expect(await read(outDir, 'apps/api/src/app/gateway-services.ts')).not.toContain('notes');
    expect(await auditProject(outDir)).toEqual([]);
    if (api !== 'rest') {
      const surfaces = await read(outDir, 'apps/api/src/app/graphql/api-surfaces.module.ts');
      expect(surfaces).toMatch(
        /imports: \[\s*ApiGraphqlModule,\s*ProfileGraphqlModule,\s*StorageGraphqlModule,?\s*\]/,
      );
      const resolvers = await read(outDir, 'apps/api/src/app/graphql/api-surface-resolvers.ts');
      expect(resolvers).toMatch(/\[\s*HealthResolver,\s*ProfileResolver,\s*StorageResolver,?\s*\]/);
      for (const p of [
        'apps/client/src/queries/notes.gql-api.ts',
        'apps/client/src/graphql/notes.queries.ts',
        'apps/client/src/graphql/gql/notes.graphql',
      ])
        expect(await exists(join(outDir, p)), p).toBe(false);
    }
  }, 120_000);
});

const read = (dir: string, rel: string) => readFile(join(dir, rel), 'utf8');

/** Relative imports under apps/client/src (code and `.graphql` documents) to a missing file. */
async function danglingClientImports(outDir: string): Promise<string[]> {
  const out: string[] = [];
  const root = join(outDir, 'apps/client/src');
  for (const file of await walk(root)) {
    // Regenerated from src/routes by the TanStack router plugin on the next serve/build/test.
    if (!/\.(ts|tsx)$/.test(file) || file.endsWith('routeTree.gen.ts')) continue;
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
      const target = resolve(dirname(file), m[1] as string);
      const found = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) =>
        existsSync(target + ext),
      );
      if (!found) out.push(`${relative(outDir, file)} -> ${m[1]}`);
    }
  }
  return out;
}

describe.each([
  ['rest', 'shadcn'],
  ['graphql', 'shadcn'],
  ['graphql', 'antd'],
  ['both', 'mui'],
] as const)('remove-notes on an api=%s ui=%s project (client)', (api, ui) => {
  it('leaves no client import of a removed file', async () => {
    const outDir = await scaffoldAndRemoveNotes(api, ui);
    try {
      expect(await danglingClientImports(outDir)).toEqual([]);
    } finally {
      await rm(dirname(outDir), { recursive: true, force: true });
    }
  }, 120_000);
});

describe('remove-notes keeps the gateway compiling (api=graphql)', () => {
  it('tsc --noEmit passes on apps/api after the transformation', async () => {
    const outDir = await scaffoldAndRemoveNotes('graphql');
    await symlink(join(repoRoot, 'node_modules'), join(outDir, 'node_modules'), 'dir');
    const tsc = join(repoRoot, 'node_modules/typescript/bin/tsc');
    for (const cfg of ['apps/api/tsconfig.app.json', 'apps/api/tsconfig.spec.json']) {
      const r = spawnSync('node', [tsc, '--noEmit', '-p', cfg], { cwd: outDir, encoding: 'utf8' });
      expect(r.stdout + r.stderr, cfg).toBe('');
      expect(r.status, cfg).toBe(0);
    }
  }, 300_000);
});

describe('remove-notes entry point', () => {
  // main() runs only when the script is executed, also through a symlink; importing it (above)
  // never runs main(). A stub `yarn` on PATH records the first nx call and fails it.
  it('runs main() when executed through a symlink', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-rm-notes-entry-'));
    await mkdir(join(dir, 'tools'));
    await copyFile(join(repoRoot, 'tools/remove-notes.mjs'), join(dir, 'tools/remove-notes.mjs'));
    await symlink(join(dir, 'tools/remove-notes.mjs'), join(dir, 'linked.mjs'));
    await mkdir(join(dir, 'bin'));
    await writeFile(join(dir, 'bin/yarn'), '#!/bin/sh\necho "stub-yarn $*"\nexit 3\n');
    await chmod(join(dir, 'bin/yarn'), 0o755);
    const r = spawnSync('node', [join(dir, 'linked.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}` },
    });
    expect(r.stdout).toContain('stub-yarn nx g @nx/workspace:remove --projectName=notes');
    expect(r.status).toBe(1);
  });
});
