import { beforeAll, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold } from '../scaffold.js';
import { auditProject } from '../../manifest/audit.js';
import type { CreateIcoreOptions } from '../options.js';

// Server side of the `--api` axis on the real snapshot (`templates/`), like
// scaffold-ui-none.unit.test.ts. The client side (apps/client) is covered separately.
const realTemplatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../templates');

const base: CreateIcoreOptions = {
  projectName: 'api-axis',
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

const AUTH_NONE = {
  authProvider: 'none',
  dbProvider: 'none',
  example: 'none',
} as const satisfies Partial<CreateIcoreOptions>;

const GRAPHQL_DEPS = [
  '@nestjs/graphql',
  '@nestjs/apollo',
  '@apollo/server',
  'graphql',
  '@as-integrations/express5',
];

const APP = 'apps/api/src/app';

async function generate(over: Partial<CreateIcoreOptions>): Promise<string> {
  const outDir = join(await mkdtemp(join(tmpdir(), 'icore-api-axis-')), 'api-axis');
  await scaffold({ ...base, ...over, targetDir: outDir }, realTemplatesDir);
  return outDir;
}

const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

const read = (dir: string, rel: string) => readFile(join(dir, rel), 'utf8');

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

/** `X` from every `import { X } from '...'` line. */
function importedSymbols(src: string): string[] {
  return [...src.matchAll(/^import \{ (\w+) \} from '[^']+';$/gm)].map((m) => m[1] as string);
}

/** Relative imports of the gateway sources (and its scripts) that point at a missing file. */
async function danglingRelativeImports(outDir: string): Promise<string[]> {
  const roots = ['apps/api/src', 'apps/api/scripts'].map((r) => join(outDir, r)).filter(existsSync);
  const out: string[] = [];
  for (const root of roots) {
    for (const file of await walk(root)) {
      if (!file.endsWith('.ts')) continue;
      const src = await readFile(file, 'utf8');
      for (const m of src.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'/g)) {
        const target = resolve(dirname(file), m[1] as string);
        const found = ['', '.ts', '/index.ts'].some((ext) => existsSync(target + ext));
        if (!found) out.push(`${relative(outDir, file)} -> ${m[1]}`);
      }
    }
  }
  return out;
}

/** Shared checks for every generated project. */
async function expectSound(outDir: string): Promise<void> {
  expect(await auditProject(outDir)).toEqual([]);
  expect(await danglingRelativeImports(outDir)).toEqual([]);
}

describe('scaffold --api=rest (supabase, notes, upload)', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ api: 'rest' });
  }, 120_000);

  it('ships no server GraphQL path', async () => {
    const files = (await walk(outDir))
      .map((f) => relative(outDir, f))
      // apps/client is the client half of the axis (separate change).
      .filter((f) => !f.startsWith('apps/client/'));
    expect(files.filter((f) => /graphql|schema\.gql/i.test(f))).toEqual([]);
  });

  it('has no GraphQL dependency in apps/api/package.json and no graphql-schema target', async () => {
    const pkg = JSON.parse(await read(outDir, 'apps/api/package.json')) as {
      dependencies: Record<string, string>;
    };
    for (const d of GRAPHQL_DEPS) expect(pkg.dependencies[d], d).toBeUndefined();
    expect(await read(outDir, 'apps/api/project.json')).not.toContain('graphql-schema');
    expect(await read(outDir, 'apps/api/vitest.config.mts')).not.toMatch(/graphql/);
    expect(await read(outDir, 'apps/api/eslint.config.mjs')).not.toMatch(/express5/);
  });

  it('keeps the REST controllers and modules', async () => {
    for (const p of [
      `${APP}/notes/notes.controller.ts`,
      `${APP}/notes/notes.module.ts`,
      `${APP}/profile/profile.controller.ts`,
      `${APP}/profile/profile.module.ts`,
      `${APP}/storage/storage.controller.ts`,
    ])
      expect(await exists(join(outDir, p)), p).toBe(true);
    expect(await read(outDir, `${APP}/features.module.ts`)).toContain('NotesModule');
    expect(await read(outDir, `${APP}/app.module.ts`)).not.toContain('ApiSurfacesModule');
  });

  it('is sound', async () => expectSound(outDir));
});

describe('scaffold --api=graphql (supabase, notes, upload)', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ api: 'graphql' });
  }, 120_000);

  it('drops the REST controllers of notes and profile', async () => {
    for (const p of [
      `${APP}/notes/notes.controller.ts`,
      `${APP}/notes/notes.module.ts`,
      `${APP}/profile/profile.controller.ts`,
      `${APP}/profile/profile.module.ts`,
      `${APP}/storage/storage.controller.ts`,
      `${APP}/storage/storage.controllers.graphql.ts`,
      'apps/api/schema.gql',
    ])
      expect(await exists(join(outDir, p)), p).toBe(false);
  });

  it('ships the resolvers and modules of every surface', async () => {
    for (const p of [
      `${APP}/notes/graphql/notes-graphql.module.ts`,
      `${APP}/notes/graphql/notes.resolver.ts`,
      `${APP}/profile/graphql/profile-graphql.module.ts`,
      `${APP}/profile/graphql/profile.resolver.ts`,
      `${APP}/storage/graphql/storage-graphql.module.ts`,
      `${APP}/storage/graphql/storage.resolver.ts`,
      `${APP}/notes/notes-gateway.service.ts`,
      'apps/api/scripts/emit-schema.ts',
    ])
      expect(await exists(join(outDir, p)), p).toBe(true);
  });

  it('ApiSurfacesModule imports exactly the selected surfaces', async () => {
    const mod = await read(outDir, `${APP}/graphql/api-surfaces.module.ts`);
    expect(importedSymbols(mod).sort()).toEqual([
      'ApiGraphqlModule',
      'Module',
      'NotesGraphqlModule',
      'ProfileGraphqlModule',
      'StorageGraphqlModule',
    ]);
  });

  it('app.module.ts imports ApiSurfacesModule and no REST ProfileModule', async () => {
    const app = await read(outDir, `${APP}/app.module.ts`);
    expect(app).toContain('ApiSurfacesModule,');
    expect(app).not.toContain('ProfileModule');
  });

  it('storage.controllers.ts registers only the files controller', async () => {
    const reg = await read(outDir, `${APP}/storage/storage.controllers.ts`);
    expect(reg).toContain('export const STORAGE_REST_CONTROLLERS = [StorageFilesController];');
    expect(reg).not.toMatch(/\bStorageController\b/);
  });

  it('features.module.ts has no NotesModule but gateway-services.ts still lists notes', async () => {
    expect(await read(outDir, `${APP}/features.module.ts`)).not.toContain('NotesModule');
    expect(await read(outDir, `${APP}/gateway-services.ts`)).toContain(
      "{ name: 'notes', prefix: 'NOTES' }",
    );
  });

  it('keeps the GraphQL dependencies and the graphql-schema target', async () => {
    const pkg = JSON.parse(await read(outDir, 'apps/api/package.json')) as {
      dependencies: Record<string, string>;
    };
    for (const d of GRAPHQL_DEPS) expect(pkg.dependencies[d], d).toBeDefined();
    expect(await read(outDir, 'apps/api/project.json')).toContain('graphql-schema');
  });

  it('drops the schema snapshot and the integration test (boots REST NotesModule)', async () => {
    expect(await exists(join(outDir, `${APP}/graphql/__tests__/schema.unit.test.ts`))).toBe(false);
    expect(
      await exists(join(outDir, `${APP}/graphql/__tests__/graphql.integration.unit.test.ts`)),
    ).toBe(false);
  });

  it('is sound', async () => expectSound(outDir));
});

describe('scaffold --api=both (supabase, notes, upload)', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ api: 'both' });
  }, 120_000);

  it('ships the REST controllers and the resolvers', async () => {
    for (const p of [
      `${APP}/notes/notes.controller.ts`,
      `${APP}/profile/profile.controller.ts`,
      `${APP}/storage/storage.controller.ts`,
      `${APP}/notes/graphql/notes.resolver.ts`,
      `${APP}/profile/graphql/profile.resolver.ts`,
      `${APP}/storage/graphql/storage.resolver.ts`,
      `${APP}/graphql/__tests__/graphql.integration.unit.test.ts`,
    ])
      expect(await exists(join(outDir, p)), p).toBe(true);
    expect(await exists(join(outDir, `${APP}/storage/storage.controllers.graphql.ts`))).toBe(false);
  });

  it('app.module.ts keeps ProfileModule and adds ApiSurfacesModule', async () => {
    const app = await read(outDir, `${APP}/app.module.ts`);
    expect(app).toContain('ProfileModule,');
    expect(app).toContain('ApiSurfacesModule,');
    expect(await read(outDir, `${APP}/features.module.ts`)).toContain('NotesModule');
  });

  it('is sound', async () => expectSound(outDir));
});

describe('scaffold --api=graphql --example=none --upload=none', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ api: 'graphql', example: 'none', upload: 'none' });
  }, 120_000);

  it('wires only the profile surface', async () => {
    const mod = await read(outDir, `${APP}/graphql/api-surfaces.module.ts`);
    expect(importedSymbols(mod).sort()).toEqual([
      'ApiGraphqlModule',
      'Module',
      'ProfileGraphqlModule',
    ]);
    const res = await read(outDir, `${APP}/graphql/api-surface-resolvers.ts`);
    expect(importedSymbols(res).sort()).toEqual(['HealthResolver', 'ProfileResolver']);
    expect(await exists(join(outDir, `${APP}/notes`))).toBe(false);
    expect(await exists(join(outDir, `${APP}/storage`))).toBe(false);
  });

  it('is sound', async () => expectSound(outDir));
});

describe.each([
  ['graphql', { api: 'graphql', upload: 'supabase' }],
  ['both', { api: 'both', upload: 'none' }],
] as const)('scaffold --api=%s with auth=none', (_label, over) => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ ...AUTH_NONE, ...over });
  }, 120_000);

  it('wires only ApiGraphqlModule (health)', async () => {
    const mod = await read(outDir, `${APP}/graphql/api-surfaces.module.ts`);
    expect(importedSymbols(mod).sort()).toEqual(['ApiGraphqlModule', 'Module']);
    const res = await read(outDir, `${APP}/graphql/api-surface-resolvers.ts`);
    expect(importedSymbols(res)).toEqual(['HealthResolver']);
    expect(await exists(join(outDir, `${APP}/graphql/health.resolver.ts`))).toBe(true);
  });

  it('drops the per-feature surfaces and the auth-importing GraphQL tests', async () => {
    for (const p of [
      `${APP}/storage/graphql`,
      `${APP}/graphql/__tests__/graphql.integration.unit.test.ts`,
      `${APP}/graphql/__tests__/health.resolver.unit.test.ts`,
      `${APP}/graphql/__tests__/schema.unit.test.ts`,
      `${APP}/auth`,
    ])
      expect(await exists(join(outDir, p)), p).toBe(false);
  });

  it('registers throttlerOptions (the default throttler) and ApiSurfacesModule, no APP_GUARD', async () => {
    const app = await read(outDir, `${APP}/app.module.ts`);
    expect(app).toContain("import { throttlerOptions } from './http/throttler.config';");
    expect(app).toContain('ThrottlerModule.forRoot(throttlerOptions),');
    expect(app).toContain('ApiSurfacesModule,');
    expect(app).not.toContain('APP_GUARD');
  });

  it('is sound', async () => expectSound(outDir));
});

describe('scaffold --api=graphql with auth=none keeps storage on REST', () => {
  it('leaves the REST storage controller registry in place', async () => {
    const outDir = await generate({ ...AUTH_NONE, api: 'graphql', upload: 'supabase' });
    const reg = await read(outDir, `${APP}/storage/storage.controllers.ts`);
    expect(reg).toContain('StorageController');
    expect(await exists(join(outDir, `${APP}/storage/storage.controller.ts`))).toBe(true);
    expect(await exists(join(outDir, `${APP}/storage/storage.controllers.graphql.ts`))).toBe(false);
  }, 120_000);
});

describe('scaffold --api=rest with auth=none (decision 12: unchanged)', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await generate({ ...AUTH_NONE, api: 'rest' });
  }, 120_000);

  it("keeps today's auth-none app.module.ts", async () => {
    expect(await read(outDir, `${APP}/app.module.ts`)).toBe(
      [
        "import { join } from 'node:path';",
        "import { Module } from '@nestjs/common';",
        "import { ConfigModule } from '@nestjs/config';",
        "import { ThrottlerModule, seconds } from '@nestjs/throttler';",
        "import { StorageModule } from './storage/storage.module';",
        "import { FeaturesModule } from './features.module';",
        '',
        '@Module({',
        '  imports: [',
        '    ConfigModule.forRoot({',
        '      isGlobal: true,',
        "      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],",
        '    }),',
        "    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),",
        '    StorageModule,',
        '    FeaturesModule,',
        '  ],',
        '})',
        'export class AppModule {}',
        '',
      ].join('\n'),
    );
    expect(await exists(join(outDir, `${APP}/graphql`))).toBe(false);
  });

  it('is sound', async () => expectSound(outDir));
});
