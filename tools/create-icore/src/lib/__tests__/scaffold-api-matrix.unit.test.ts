import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.js';
import { auditProject } from '../../manifest/audit.js';
import type { CreateIcoreOptions } from '../options.js';

// The whole `--api` axis on the real snapshot: api x auth x ui x features. Typechecking is the
// link-mode smoke's job; this matrix pins the file set and the import graph of every combination.
const realTemplatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates');

const base: CreateIcoreOptions = {
  projectName: 'matrix',
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

type Combo = Pick<
  CreateIcoreOptions,
  'api' | 'authProvider' | 'dbProvider' | 'ui' | 'example' | 'upload'
>;

const FEATURES = [
  { authProvider: 'supabase', dbProvider: 'supabase', example: 'notes', upload: 'supabase' },
  { authProvider: 'supabase', dbProvider: 'supabase', example: 'none', upload: 'none' },
  { authProvider: 'none', dbProvider: 'none', example: 'none', upload: 'supabase' },
  { authProvider: 'none', dbProvider: 'none', example: 'none', upload: 'none' },
] as const;

const COMBOS: Combo[] = (['rest', 'graphql', 'both'] as const).flatMap((api) =>
  (['shadcn', 'antd', 'mui', 'none'] as const).flatMap((ui) =>
    FEATURES.map((f) => ({ api, ui, ...f })),
  ),
);

const label = (c: Combo) =>
  `api=${c.api} ui=${c.ui} auth=${c.authProvider} example=${c.example} upload=${c.upload}`;

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

// Not part of the api axis, reported to the owner: on the branch base already, an auth=none
// shadcn project ships this test without the route it imports (AUTH_NONE excludes the route only).
const KNOWN_PREEXISTING = new Set([
  'apps/client/src/routes/__tests__/auth.callback.unit.test.tsx -> ../auth.callback',
]);

/** Relative imports (code and `.graphql` documents) that point at a missing file. */
async function danglingRelativeImports(outDir: string): Promise<string[]> {
  const out: string[] = [];
  for (const root of ['apps/api/src', 'apps/api/scripts', 'apps/client/src']) {
    if (!existsSync(join(outDir, root))) continue;
    for (const file of await walk(join(outDir, root))) {
      // Regenerated from src/routes by the TanStack router plugin on the first serve/build/test.
      if (!/\.(ts|tsx)$/.test(file) || file.endsWith('routeTree.gen.ts')) continue;
      const src = await readFile(file, 'utf8');
      for (const m of src.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
        const target = resolve(dirname(file), m[1] as string);
        const found = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].some((ext) =>
          existsSync(target + ext),
        );
        const entry = `${relative(outDir, file)} -> ${m[1]}`;
        if (!found && !KNOWN_PREEXISTING.has(entry)) out.push(entry);
      }
    }
  }
  return out;
}

const has = (dir: string, rel: string) => existsSync(join(dir, rel));

async function emptyDirs(dir: string, root = dir, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.length === 0) out.push(relative(root, dir));
  for (const e of entries) {
    // The router plugin's empty local cache (never in git or CI), copied by a local snapshot.
    if (e.isDirectory() && e.name !== '.tanstack') await emptyDirs(join(dir, e.name), root, out);
  }
  return out;
}
const read = (dir: string, rel: string) => readFile(join(dir, rel), 'utf8');

describe.each(COMBOS.map((c) => [label(c), c] as const))('scaffold %s', (_label, combo) => {
  it('is sound and ships exactly its API surfaces', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'icore-matrix-'));
    try {
      await check(join(tmp, 'matrix'), combo);
    } finally {
      // 48 full projects: do not leave them in tmpfs.
      await rm(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});

async function check(outDir: string, combo: Combo): Promise<void> {
  await scaffold({ ...base, ...combo, targetDir: outDir }, realTemplatesDir);
  const { api, ui, authProvider, example } = combo;
  const auth = authProvider !== 'none';
  const client = ui !== 'none';
  const gqlClient = api === 'graphql' && client;

  expect(await auditProject(outDir)).toEqual([]);
  expect(await danglingRelativeImports(outDir)).toEqual([]);

  // No directory is left empty by an exclusion (the pre-axis generator left none).
  expect(await emptyDirs(outDir)).toEqual([]);

  // Server
  expect(has(outDir, 'apps/api/src/app/graphql/graphql.module.ts')).toBe(api !== 'rest');
  const apiProject = JSON.parse(await read(outDir, 'apps/api/project.json')) as {
    targets: Record<string, unknown>;
  };
  expect(apiProject.targets['graphql-schema'] !== undefined).toBe(api !== 'rest');
  expect(has(outDir, 'apps/api/schema.gql')).toBe(false);
  expect(has(outDir, 'apps/api/src/app/notes/notes.controller.ts')).toBe(
    example === 'notes' && api !== 'graphql',
  );
  expect(has(outDir, 'apps/api/src/app/notes/graphql')).toBe(example === 'notes' && api !== 'rest');

  // Client
  const files = client
    ? (await walk(join(outDir, 'apps/client'))).map((f) => relative(outDir, f))
    : [];
  expect(files.filter((f) => f.includes('.gql-api'))).toEqual([]);
  expect(has(outDir, 'apps/client/src/api/graphql.ts')).toBe(gqlClient);
  expect(has(outDir, 'apps/client/codegen.ts')).toBe(gqlClient);
  expect(has(outDir, 'apps/client/src/graphql/gql/notes.graphql')).toBe(
    gqlClient && example === 'notes',
  );
  expect(has(outDir, 'apps/client/src/graphql/gql/profile.graphql')).toBe(gqlClient && auth);
  if (!client) return;

  const vite = await read(outDir, 'apps/client/vite.config.mts');
  expect(vite.includes('graphqlLoader()')).toBe(gqlClient);
  if (!gqlClient) {
    for (const rel of [
      'vite.config.mts',
      'tsconfig.app.json',
      'tsconfig.spec.json',
      'package.json',
    ])
      expect(await read(outDir, `apps/client/${rel}`), rel).not.toMatch(/graphql/i);
  }
  const pkg = await read(outDir, 'apps/client/package.json');
  expect(pkg.includes('"graphql"')).toBe(gqlClient);
  const project = JSON.parse(await read(outDir, 'apps/client/project.json')) as {
    targets: Record<string, { dependsOn?: string[]; options?: { cwd?: string } }>;
  };
  if (gqlClient) {
    expect(project.targets['graphql-codegen']?.dependsOn).toEqual(['api:graphql-schema']);
    expect(project.targets['graphql-codegen']?.options?.cwd).toBe('apps/client');
    const codegen = await read(outDir, 'apps/client/codegen.ts');
    expect(codegen).toContain("'../../apps/api/schema.gql'");
    // auth=none ships no operation at all: codegen must still succeed (health-only schema).
    expect(codegen).toContain('ignoreNoDocuments: true');
  } else {
    expect(project.targets['graphql-codegen']).toBeUndefined();
  }
  if (example === 'notes') {
    const notes = await read(outDir, 'apps/client/src/queries/notes.ts');
    expect(notes.includes("from '../api/graphql'")).toBe(gqlClient);
  }
  if (auth) {
    const profile = await read(outDir, 'apps/client/src/queries/profile.ts');
    expect(profile.includes("from '../api/graphql'")).toBe(gqlClient);
  }
}
