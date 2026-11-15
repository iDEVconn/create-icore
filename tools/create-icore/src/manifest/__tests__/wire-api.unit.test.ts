import { describe, it, expect } from 'vitest';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyApiVariants, wireApi } from '../wire-api.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

// The fixture is made of the repo's real gateway files, so a change in their shape (the regex
// anchors wireApi relies on) fails here first.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const API_FILES = [
  'apps/api/package.json',
  'apps/api/project.json',
  'apps/api/eslint.config.mjs',
  'apps/api/vitest.config.mts',
  'apps/api/tsconfig.app.json',
  '.prettierignore',
  'apps/api/src/app/app.module.ts',
  'apps/api/src/app/graphql/api-surfaces.module.ts',
  'apps/api/src/app/graphql/api-surface-resolvers.ts',
  'apps/api/src/app/storage/storage.controllers.ts',
  'apps/api/src/app/storage/storage.controllers.graphql.ts',
];

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  ai: 'none',
  example: 'notes',
  ui: 'shadcn',
  api: 'graphql',
  transport: 'tcp',
  session: 'redis',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

const GRAPHQL_DEPS = [
  '@nestjs/graphql',
  '@nestjs/apollo',
  '@apollo/server',
  'graphql',
  '@as-integrations/express5',
];

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-api-'));
  for (const rel of API_FILES) {
    await mkdir(dirname(join(dir, rel)), { recursive: true });
    await copyFile(join(repoRoot, rel), join(dir, rel));
  }
  return dir;
}

async function run(over: Partial<CreateIcoreOptions>): Promise<string> {
  const dir = await fixture();
  await wireApi(dir, { ...base, ...over, targetDir: dir });
  return dir;
}

const read = (dir: string, rel: string) => readFile(join(dir, rel), 'utf8');
const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

/** `X` from every `import { X } from '...'` line. */
function importedSymbols(src: string): string[] {
  return [...src.matchAll(/^import \{ (\w+) \} from '[^']+';$/gm)].map((m) => m[1] as string);
}

describe('wireApi: api=rest', () => {
  it('strips the GraphQL dependencies from apps/api/package.json', async () => {
    const dir = await run({ api: 'rest' });
    const pkg = JSON.parse(await read(dir, 'apps/api/package.json')) as {
      dependencies: Record<string, string>;
    };
    for (const d of GRAPHQL_DEPS) expect(pkg.dependencies[d], d).toBeUndefined();
    expect(pkg.dependencies['@nestjs/core']).toBeDefined();
  });

  it('drops the graphql-schema target from apps/api/project.json', async () => {
    const dir = await run({ api: 'rest' });
    const project = JSON.parse(await read(dir, 'apps/api/project.json')) as {
      targets: Record<string, unknown>;
    };
    expect(project.targets['graphql-schema']).toBeUndefined();
    expect(project.targets['build']).toBeDefined();
  });

  it('removes the express5 dependency-checks exemption and the vitest graphql alias', async () => {
    const dir = await run({ api: 'rest' });
    const eslint = await read(dir, 'apps/api/eslint.config.mjs');
    expect(eslint).not.toMatch(/express5|apollo/);
    expect(eslint).toContain(
      "ignoredDependencies: ['@bull-board/ui', 'bullmq', 'reflect-metadata', 'rxjs'],",
    );
    const vitest = await read(dir, 'apps/api/vitest.config.mts');
    expect(vitest).not.toMatch(/graphql|createRequire/);
    expect(vitest).toContain('tsconfigPaths: true,');
  });

  it('leaves app.module.ts untouched', async () => {
    const dir = await run({ api: 'rest' });
    expect(await read(dir, 'apps/api/src/app/app.module.ts')).toBe(
      await readFile(join(repoRoot, 'apps/api/src/app/app.module.ts'), 'utf8'),
    );
  });
});

describe('wireApi: api=graphql (auth, notes, upload)', () => {
  it('generates ApiSurfacesModule with exactly the surfaces of the selected features', async () => {
    const dir = await run({});
    const mod = await read(dir, 'apps/api/src/app/graphql/api-surfaces.module.ts');
    expect(importedSymbols(mod).sort()).toEqual([
      'ApiGraphqlModule',
      'Module',
      'NotesGraphqlModule',
      'ProfileGraphqlModule',
      'StorageGraphqlModule',
    ]);
    expect(mod).toMatch(
      /imports: \[\s*ApiGraphqlModule,\s*NotesGraphqlModule,\s*ProfileGraphqlModule,\s*StorageGraphqlModule,?\s*\]/,
    );
    expect(mod).toContain('export class ApiSurfacesModule {}');
  });

  it('generates API_SURFACE_RESOLVERS with health plus the selected resolvers', async () => {
    const dir = await run({});
    const src = await read(dir, 'apps/api/src/app/graphql/api-surface-resolvers.ts');
    expect(importedSymbols(src).sort()).toEqual([
      'HealthResolver',
      'NotesResolver',
      'ProfileResolver',
      'StorageResolver',
    ]);
    expect(src).toContain('export const API_SURFACE_RESOLVERS: Function[] = [');
  });

  it('imports ApiSurfacesModule into app.module.ts and drops the REST ProfileModule', async () => {
    const dir = await run({});
    const app = await read(dir, 'apps/api/src/app/app.module.ts');
    expect(app).toContain("import { ApiSurfacesModule } from './graphql/api-surfaces.module';");
    expect(app).toMatch(/\n {4}ApiSurfacesModule,\n {4}FeaturesModule,\n/);
    expect(app).not.toContain('ProfileModule');
    expect(app).toContain('AuthModule,');
  });

  it('swaps the GraphQL storage controller registry over the REST one', async () => {
    const dir = await run({});
    expect(await read(dir, 'apps/api/src/app/storage/storage.controllers.ts')).toBe(
      await readFile(
        join(repoRoot, 'apps/api/src/app/storage/storage.controllers.graphql.ts'),
        'utf8',
      ),
    );
    expect(await exists(join(dir, 'apps/api/src/app/storage/storage.controllers.graphql.ts'))).toBe(
      false,
    );
  });

  it('keeps the GraphQL dependencies and the graphql-schema target', async () => {
    const dir = await run({});
    const pkg = JSON.parse(await read(dir, 'apps/api/package.json')) as {
      dependencies: Record<string, string>;
    };
    for (const d of GRAPHQL_DEPS) expect(pkg.dependencies[d], d).toBeDefined();
    expect(await read(dir, 'apps/api/project.json')).toContain('"graphql-schema"');
  });
});

describe('wireApi: api=graphql --example=none --upload=none', () => {
  it('wires only the profile surface', async () => {
    const dir = await run({ example: 'none', upload: 'none' });
    const mod = await read(dir, 'apps/api/src/app/graphql/api-surfaces.module.ts');
    expect(importedSymbols(mod).sort()).toEqual([
      'ApiGraphqlModule',
      'Module',
      'ProfileGraphqlModule',
    ]);
    expect(mod).not.toMatch(/notes|storage/);
    const res = await read(dir, 'apps/api/src/app/graphql/api-surface-resolvers.ts');
    expect(importedSymbols(res).sort()).toEqual(['HealthResolver', 'ProfileResolver']);
  });
});

describe('wireApi: api=both', () => {
  it('keeps the REST ProfileModule, adds ApiSurfacesModule, keeps the REST storage registry', async () => {
    const dir = await run({ api: 'both' });
    const app = await read(dir, 'apps/api/src/app/app.module.ts');
    expect(app).toContain("import { ProfileModule } from './profile/profile.module';");
    expect(app).toMatch(/\n {4}ProfileModule,\n/);
    expect(app).toContain("import { ApiSurfacesModule } from './graphql/api-surfaces.module';");
    expect(app).toMatch(/\n {4}ApiSurfacesModule,\n {4}FeaturesModule,\n/);
    expect(await read(dir, 'apps/api/src/app/storage/storage.controllers.ts')).toBe(
      await readFile(join(repoRoot, 'apps/api/src/app/storage/storage.controllers.ts'), 'utf8'),
    );
    expect(await exists(join(dir, 'apps/api/src/app/storage/storage.controllers.graphql.ts'))).toBe(
      false,
    );
  });
});

describe('wireApi: auth=none (health only)', () => {
  it.each(['graphql', 'both'] as const)(
    'api=%s wires only ApiGraphqlModule and the health resolver',
    async (api) => {
      const dir = await run({
        api,
        authProvider: 'none',
        dbProvider: 'none',
        example: 'none',
      });
      const mod = await read(dir, 'apps/api/src/app/graphql/api-surfaces.module.ts');
      expect(importedSymbols(mod).sort()).toEqual(['ApiGraphqlModule', 'Module']);
      const res = await read(dir, 'apps/api/src/app/graphql/api-surface-resolvers.ts');
      expect(importedSymbols(res)).toEqual(['HealthResolver']);
      // No StorageResolver: the REST storage registry stays.
      expect(await read(dir, 'apps/api/src/app/storage/storage.controllers.ts')).toBe(
        await readFile(join(repoRoot, 'apps/api/src/app/storage/storage.controllers.ts'), 'utf8'),
      );
    },
  );

  it('adds ApiSurfacesModule to the auth-none overlay app.module.ts', async () => {
    const dir = await fixture();
    const overlay = [
      "import { Module } from '@nestjs/common';",
      "import { FeaturesModule } from './features.module';",
      '',
      '@Module({',
      '  imports: [',
      '    FeaturesModule,',
      '  ],',
      '})',
      'export class AppModule {}',
      '',
    ].join('\n');
    await writeFile(join(dir, 'apps/api/src/app/app.module.ts'), overlay);
    await wireApi(dir, {
      ...base,
      targetDir: dir,
      authProvider: 'none',
      dbProvider: 'none',
      example: 'none',
      upload: 'none',
    });
    const app = await read(dir, 'apps/api/src/app/app.module.ts');
    expect(app).toContain("import { ApiSurfacesModule } from './graphql/api-surfaces.module';");
    expect(app).toMatch(/\n {4}ApiSurfacesModule,\n {4}FeaturesModule,\n/);
  });
});

describe('wireApi: guard rails', () => {
  it('fails loudly when api=graphql cannot find the REST ProfileModule to drop', async () => {
    const dir = await fixture();
    const app = join(dir, 'apps/api/src/app/app.module.ts');
    const src = await readFile(app, 'utf8');
    await writeFile(app, src.replace(/^import \{ ProfileModule \}.*\n/m, ''));
    await expect(wireApi(dir, { ...base, targetDir: dir })).rejects.toThrow(/ProfileModule/);
  });

  it.each(['graphql', 'both'] as const)('is idempotent (api=%s)', async (api) => {
    const dir = await run({ api });
    const once = await read(dir, 'apps/api/src/app/app.module.ts');
    await wireApi(dir, { ...base, api, targetDir: dir });
    expect(await read(dir, 'apps/api/src/app/app.module.ts')).toBe(once);
    expect(once.match(/ApiSurfacesModule/g)).toHaveLength(2);
  });

  it('fails loudly when app.module.ts has no FeaturesModule anchor', async () => {
    const dir = await fixture();
    await writeFile(join(dir, 'apps/api/src/app/app.module.ts'), 'export class AppModule {}\n');
    await expect(wireApi(dir, { ...base, targetDir: dir })).rejects.toThrow(/FeaturesModule/);
  });
});

// Client half: the chosen template already promoted to apps/client (selectClientTemplate).
const CLIENT_TEMPLATE = 'apps/templates/client-shadcn';
const CLIENT_FILES = [
  'package.json',
  'project.json',
  'vite.config.mts',
  'tsconfig.app.json',
  'tsconfig.spec.json',
  'codegen.ts',
  'src/queries/notes.ts',
  'src/queries/notes.gql-api.ts',
  'src/queries/profile.ts',
  'src/queries/profile.gql-api.ts',
  'src/queries/__tests__/notes.gql-api.unit.test.ts',
  'src/queries/__tests__/profile.gql-api.unit.test.ts',
  'src/queries/__tests__/profile.unit.test.ts',
];
const CLIENT_DEPS = [
  'graphql',
  '@graphql-codegen/cli',
  '@graphql-codegen/typescript-operations',
  '@graphql-typed-document-node/core',
  'vite-plugin-graphql-loader',
];

async function clientFixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-api-client-'));
  for (const rel of CLIENT_FILES) {
    const dest = join(dir, 'apps/client', rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(join(repoRoot, CLIENT_TEMPLATE, rel), dest);
  }
  return dir;
}

async function runClient(over: Partial<CreateIcoreOptions>): Promise<string> {
  const dir = await clientFixture();
  await applyApiVariants(dir, { ...base, ...over, targetDir: dir });
  return dir;
}

const template = (rel: string) => readFile(join(repoRoot, CLIENT_TEMPLATE, rel), 'utf8');

describe('applyApiVariants: api=graphql', () => {
  it('swaps the GraphQL query hooks over their REST twins', async () => {
    const dir = await runClient({ api: 'graphql' });
    expect(await read(dir, 'apps/client/src/queries/notes.ts')).toBe(
      await template('src/queries/notes.gql-api.ts'),
    );
    expect(await read(dir, 'apps/client/src/queries/profile.ts')).toBe(
      await template('src/queries/profile.gql-api.ts'),
    );
    for (const rel of ['src/queries/notes.gql-api.ts', 'src/queries/profile.gql-api.ts'])
      expect(await exists(join(dir, 'apps/client', rel)), rel).toBe(false);
  });

  it('swaps the hook tests too and points them at the swapped files', async () => {
    const dir = await runClient({ api: 'graphql' });
    const notes = await read(dir, 'apps/client/src/queries/__tests__/notes.unit.test.ts');
    expect(notes).toContain("from '../notes';");
    expect(notes).not.toContain('gql-api');
    const profile = await read(dir, 'apps/client/src/queries/__tests__/profile.unit.test.ts');
    expect(profile).toContain("from '../profile';");
    expect(profile).toContain("from '../../graphql/profile.queries';");
    for (const rel of [
      'src/queries/__tests__/notes.gql-api.unit.test.ts',
      'src/queries/__tests__/profile.gql-api.unit.test.ts',
    ])
      expect(await exists(join(dir, 'apps/client', rel)), rel).toBe(false);
  });

  it('keeps the loader, the client deps and a codegen target that emits the schema first', async () => {
    const dir = await runClient({ api: 'graphql' });
    expect(await read(dir, 'apps/client/vite.config.mts')).toContain('graphqlLoader(),');
    const pkg = JSON.parse(await read(dir, 'apps/client/package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const d of CLIENT_DEPS)
      expect(pkg.dependencies[d] ?? pkg.devDependencies[d], d).toBeDefined();
    const project = JSON.parse(await read(dir, 'apps/client/project.json')) as {
      targets: Record<string, { dependsOn?: string[] }>;
    };
    expect(project.targets['graphql-codegen']?.dependsOn).toEqual(['api:graphql-schema']);
  });

  it('keeps the REST hooks when the GraphQL twin was not copied (feature absent)', async () => {
    const dir = await clientFixture();
    await rm(join(dir, 'apps/client/src/queries/profile.gql-api.ts'));
    await rm(join(dir, 'apps/client/src/queries/__tests__/profile.gql-api.unit.test.ts'));
    await applyApiVariants(dir, { ...base, targetDir: dir, api: 'graphql' });
    expect(await read(dir, 'apps/client/src/queries/profile.ts')).toBe(
      await template('src/queries/profile.ts'),
    );
    expect(await read(dir, 'apps/client/src/queries/__tests__/profile.unit.test.ts')).toBe(
      await template('src/queries/__tests__/profile.unit.test.ts'),
    );
  });
});

describe.each(['rest', 'both'] as const)('applyApiVariants: api=%s', (api) => {
  it('removes the loader, the d.ts includes, the client deps and the codegen target', async () => {
    const dir = await runClient({ api });
    const vite = await read(dir, 'apps/client/vite.config.mts');
    expect(vite).not.toMatch(/graphql/i);
    expect(vite).toContain('react(),\n    tailwindcss(),');
    for (const cfg of ['tsconfig.app.json', 'tsconfig.spec.json']) {
      const src = await read(dir, `apps/client/${cfg}`);
      expect(src, cfg).not.toContain('graphql');
      expect(() => JSON.parse(src), cfg).not.toThrow();
    }
    const pkg = JSON.parse(await read(dir, 'apps/client/package.json')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const d of CLIENT_DEPS) {
      expect(pkg.dependencies[d], d).toBeUndefined();
      expect(pkg.devDependencies[d], d).toBeUndefined();
    }
    expect(pkg.dependencies['react']).toBeDefined();
    const project = JSON.parse(await read(dir, 'apps/client/project.json')) as {
      targets: Record<string, unknown>;
    };
    expect(project.targets).toEqual({});
  });

  it('leaves the REST query hooks untouched', async () => {
    const dir = await runClient({ api });
    expect(await read(dir, 'apps/client/src/queries/notes.ts')).toBe(
      await template('src/queries/notes.ts'),
    );
    expect(await read(dir, 'apps/client/src/queries/profile.ts')).toBe(
      await template('src/queries/profile.ts'),
    );
  });
});

describe('applyApiVariants: ui=none', () => {
  it('is a no-op without a client', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-api-noui-'));
    await expect(
      applyApiVariants(dir, { ...base, targetDir: dir, api: 'graphql', ui: 'none' }),
    ).resolves.toBeUndefined();
    expect(await exists(join(dir, 'apps/client'))).toBe(false);
  });
});

describe('wireApi: GraphQL leftovers outside the api sources', () => {
  it('rest: no GraphQL entry in .prettierignore, no scripts include in tsconfig.app.json', async () => {
    const dir = await run({ api: 'rest' });
    const ignore = await read(dir, '.prettierignore');
    expect(ignore).not.toMatch(/graphql|schema\.gql|src\/gql/);
    expect(ignore).not.toMatch(/\n\n\n/);
    const tsconfig = await read(dir, 'apps/api/tsconfig.app.json');
    expect(tsconfig).toContain('"include": ["src/**/*.ts"],');
  });

  it('both: keeps the schema entry, drops the client types entry', async () => {
    const dir = await run({ api: 'both' });
    const ignore = await read(dir, '.prettierignore');
    expect(ignore).toContain('apps/api/schema.gql');
    expect(ignore).not.toContain('src/gql/types.ts');
    expect(await read(dir, 'apps/api/tsconfig.app.json')).toContain('scripts/**/*.ts');
  });

  it('graphql: keeps both entries', async () => {
    const dir = await run({ api: 'graphql' });
    const ignore = await read(dir, '.prettierignore');
    expect(ignore).toContain('apps/api/schema.gql');
    expect(ignore).toContain('**/src/gql/types.ts');
  });

  it('graphql with ui=none: drops the client types entry', async () => {
    const dir = await run({ api: 'graphql', ui: 'none' });
    expect(await read(dir, '.prettierignore')).not.toContain('src/gql/types.ts');
  });
});

describe('applyApiVariants: template drift fails loudly', () => {
  it.each([
    ['vite.config.mts', /^\s*graphqlLoader\(\),\n/m],
    ['vite.config.mts', /^import graphqlLoader from 'vite-plugin-graphql-loader';\n/m],
    ['tsconfig.app.json', /,\s*"graphql-loader\.d\.ts"/],
    ['tsconfig.spec.json', /,\s*"graphql-loader\.d\.ts"/],
  ] as const)('throws when %s no longer has the expected GraphQL entry (%s)', async (rel, re) => {
    const dir = await clientFixture();
    const path = join(dir, 'apps/client', rel);
    await writeFile(path, (await readFile(path, 'utf8')).replace(re, ''));
    await expect(applyApiVariants(dir, { ...base, targetDir: dir, api: 'rest' })).rejects.toThrow(
      rel,
    );
  });
});
