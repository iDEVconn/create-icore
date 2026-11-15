import { describe, it, expect } from 'vitest';
import { resolveUnits, resolveBindings } from '../resolve.js';
import { MANIFEST } from '../index.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '/tmp/x',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  ai: 'none',
  example: 'none',
  ui: 'shadcn',
  api: 'rest',
  transport: 'tcp',
  session: 'redis',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

describe('resolveUnits', () => {
  it('supabase x3 selects only supabase auth/storage/db libs, no firebase-admin', () => {
    const libs = resolveUnits(base).flatMap((u) => u.libDirs);
    expect(libs).toContain('libs/auth-strategies/supabase');
    expect(libs).toContain('libs/storage-strategies/supabase');
    expect(libs).toContain('libs/db-strategies/supabase');
    expect(libs).not.toContain('libs/auth-strategies/firebase');
    expect(libs).not.toContain('libs/firebase-admin');
  });

  it('upload=none contributes no storage unit', () => {
    const libs = resolveUnits({ ...base, upload: 'none' }).flatMap((u) => u.libDirs);
    expect(libs.some((l) => l.startsWith('libs/storage-strategies/'))).toBe(false);
  });

  it('any firebase axis pulls in the shared firebase-admin unit exactly once', () => {
    const libs = resolveUnits({ ...base, dbProvider: 'firebase' }).flatMap((u) => u.libDirs);
    expect(libs.filter((l) => l === 'libs/firebase-admin')).toHaveLength(1);
  });

  it('ai=llm-router contributes the ai-orchestrator unit', () => {
    const libs = resolveUnits({ ...base, ai: 'llm-router' }).flatMap((u) => u.libDirs);
    expect(libs).toContain('apps/microservices/ai-orchestrator');
    expect(libs).toContain('libs/ai-client');
  });

  it('ai=none contributes no ai unit', () => {
    const libs = resolveUnits(base).flatMap((u) => u.libDirs);
    expect(libs).not.toContain('apps/microservices/ai-orchestrator');
  });
});

describe('resolveBindings', () => {
  it('enables emitToolsDir and retains tools/remove-notes.mjs when example=notes', () => {
    const diag = resolveBindings({ ...base, example: 'notes' });
    expect(diag.emitToolsDir).toBe(true);
    expect(diag.activeToolFiles.has('tools/remove-notes.mjs')).toBe(true);
    expect(diag.excludedPaths.has('tools')).toBe(false);
    expect(diag.excludedPaths.has('tools/remove-notes.mjs')).toBe(false);
    expect(diag.excludedPaths.has('tools/create-icore')).toBe(true);
    expect(diag.excludedPaths.has('apps/microservices/notes')).toBe(false);
  });

  it('disables emitToolsDir and excludes tools/ and notes nodes when example=none', () => {
    const diag = resolveBindings({ ...base, example: 'none' });
    expect(diag.emitToolsDir).toBe(false);
    expect(diag.activeToolFiles.size).toBe(0);
    expect(diag.excludedPaths.has('tools')).toBe(true);
    expect(diag.excludedPaths.has('tools/remove-notes.mjs')).toBe(true);
    expect(diag.excludedPaths.has('apps/microservices/notes')).toBe(true);
    expect(diag.excludedPaths.has('libs/notes-client')).toBe(true);
    expect(
      diag.excludedPaths.has('apps/templates/client-shadcn/src/routes/_dashboard/notes.tsx'),
    ).toBe(true);
    // dbProvider is supabase, so libs/db-strategies directory itself stays active
    expect(diag.excludedPaths.has('libs/db-strategies')).toBe(false);
  });

  it('auto-downgrades example=notes to none and suppresses tools/ when authProvider=none', () => {
    const diag = resolveBindings({
      ...base,
      authProvider: 'none',
      dbProvider: 'none',
      example: 'notes',
    });
    expect(diag.options.example).toBe('none');
    expect(diag.warnings.some((w) => w.includes('notes example requires auth'))).toBe(true);
    expect(diag.emitToolsDir).toBe(false);
    expect(diag.excludedPaths.has('tools')).toBe(true);
    expect(diag.excludedPaths.has('tools/remove-notes.mjs')).toBe(true);
    expect(diag.excludedPaths.has('libs/db-strategies')).toBe(true);
  });
  describe('ui=none', () => {
    const CLIENT_PATHS = [
      'apps/templates',
      'apps/client',
      'Dockerfile.client',
      'nginx.client.conf',
      'libs/template-shared',
      'libs/vite-plugins',
    ];

    it('excludes every client artifact from the copy', () => {
      const { excludedPaths } = resolveBindings({ ...base, ui: 'none' });
      for (const p of CLIENT_PATHS) expect(excludedPaths.has(p), p).toBe(true);
    });

    it('keeps client artifacts for a real UI library', () => {
      const { excludedPaths } = resolveBindings({ ...base, ui: 'shadcn' });
      for (const p of CLIENT_PATHS) expect(excludedPaths.has(p), p).toBe(false);
    });

    it('combines with auth=none without throwing', () => {
      expect(() =>
        resolveBindings({ ...base, ui: 'none', authProvider: 'none', dbProvider: 'none' }),
      ).not.toThrow();
    });
  });

  describe('Dockerfile.ms-payment', () => {
    it('is excluded when payment=none', () => {
      const { excludedPaths } = resolveBindings({ ...base, payment: 'none' });
      expect(excludedPaths.has('Dockerfile.ms-payment')).toBe(true);
    });

    it('ships when payment=paypal', () => {
      const { excludedPaths } = resolveBindings({ ...base, payment: 'paypal' });
      expect(excludedPaths.has('Dockerfile.ms-payment')).toBe(false);
    });

    it('is dropped with the other containers on host=cloudflare', () => {
      const { excludedPaths } = resolveBindings({
        ...base,
        host: 'cloudflare',
        dbProvider: 'd1',
        upload: 'r2',
        transport: 'local',
        session: 'durable-object',
      });
      expect(excludedPaths.has('Dockerfile.ms-payment')).toBe(true);
    });
  });
});

// The `--api` axis decides which server API artefacts ship (spec sections 1, 9; decisions 2, 11).
describe('resolveBindings: api axis (server)', () => {
  const SERVER_GRAPHQL = [
    'apps/api/src/app/graphql',
    'apps/api/src/app/notes/graphql',
    'apps/api/src/app/profile/graphql',
    'apps/api/src/app/storage/graphql',
    'apps/api/schema.gql',
    'apps/api/scripts/emit-schema.ts',
    'apps/api/src/app/storage/storage.controllers.graphql.ts',
  ];
  const REST_SURFACE = [
    'apps/api/src/app/notes/notes.controller.ts',
    'apps/api/src/app/notes/notes.module.ts',
    'apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts',
    'apps/api/src/app/profile/profile.controller.ts',
    'apps/api/src/app/profile/profile.module.ts',
    'apps/api/src/app/storage/storage.controller.ts',
  ];
  const SCHEMA_TEST = 'apps/api/src/app/graphql/__tests__/schema.unit.test.ts';
  const INTEGRATION_TEST = 'apps/api/src/app/graphql/__tests__/graphql.integration.unit.test.ts';
  const HEALTH_TEST = 'apps/api/src/app/graphql/__tests__/health.resolver.unit.test.ts';
  const full = { ...base, example: 'notes' as const };
  const excluded = (o: Partial<CreateIcoreOptions>) =>
    resolveBindings({ ...full, ...o }).excludedPaths;

  it('rest: excludes every server GraphQL artefact and no REST surface', () => {
    const ex = excluded({ api: 'rest' });
    for (const p of SERVER_GRAPHQL) expect(ex.has(p), p).toBe(true);
    for (const p of REST_SURFACE) expect(ex.has(p), p).toBe(false);
  });

  it('graphql: excludes the REST surface of surfaced features and the committed schema', () => {
    const ex = excluded({ api: 'graphql' });
    for (const p of REST_SURFACE) expect(ex.has(p), p).toBe(true);
    expect(ex.has('apps/api/schema.gql')).toBe(true);
    expect(ex.has(SCHEMA_TEST)).toBe(true);
    for (const p of [
      'apps/api/src/app/graphql',
      'apps/api/src/app/notes/graphql',
      'apps/api/src/app/profile/graphql',
      'apps/api/src/app/storage/graphql',
      'apps/api/scripts/emit-schema.ts',
      'apps/api/src/app/storage/storage.controllers.graphql.ts',
      // Shared REST pieces still used by the GraphQL surface or by upload/download.
      'apps/api/src/app/notes/notes-gateway.service.ts',
      'apps/api/src/app/storage/storage.module.ts',
      'apps/api/src/app/storage/storage-files.controller.ts',
      'apps/api/src/app/storage/storage.controllers.ts',
    ])
      expect(ex.has(p), p).toBe(false);
  });

  it('graphql: drops the integration test (it boots the REST NotesModule)', () => {
    expect(excluded({ api: 'graphql' }).has(INTEGRATION_TEST)).toBe(true);
  });

  it('both: keeps REST and GraphQL surfaces, drops the committed schema and the swap file', () => {
    const ex = excluded({ api: 'both' });
    for (const p of REST_SURFACE) expect(ex.has(p), p).toBe(false);
    for (const p of SERVER_GRAPHQL.slice(0, 4)) expect(ex.has(p), p).toBe(false);
    expect(ex.has('apps/api/scripts/emit-schema.ts')).toBe(false);
    expect(ex.has('apps/api/schema.gql')).toBe(true);
    expect(ex.has('apps/api/src/app/storage/storage.controllers.graphql.ts')).toBe(true);
    expect(ex.has(SCHEMA_TEST)).toBe(true);
    expect(ex.has(INTEGRATION_TEST)).toBe(false);
  });

  it.each([
    ['example=none', { example: 'none' as const }],
    ['upload=none', { upload: 'none' as const }],
  ])('both with %s drops the integration test (needs notes and upload)', (_l, over) => {
    const ex = excluded({ api: 'both', ...over });
    expect(ex.has(INTEGRATION_TEST)).toBe(true);
    expect(ex.has('apps/api/src/app/graphql')).toBe(false);
  });

  it('graphql --example=none --upload=none keeps the graphql dir and profile surface', () => {
    const ex = excluded({ api: 'graphql', example: 'none', upload: 'none' });
    expect(ex.has('apps/api/src/app/graphql')).toBe(false);
    expect(ex.has('apps/api/src/app/profile/graphql')).toBe(false);
    expect(ex.has('apps/api/scripts/emit-schema.ts')).toBe(false);
    // Absent features vanish through their own lists.
    expect(ex.has('apps/api/src/app/notes')).toBe(true);
    expect(ex.has('apps/api/src/app/storage')).toBe(true);
  });

  describe.each(['graphql', 'both'] as const)('auth=none + api=%s', (api) => {
    const ex = () => excluded({ api, authProvider: 'none', dbProvider: 'none', example: 'none' });

    it('keeps the GraphQL module (health) and the schema script', () => {
      expect(ex().has('apps/api/src/app/graphql')).toBe(false);
      expect(ex().has('apps/api/scripts/emit-schema.ts')).toBe(false);
    });

    it('drops every per-feature GraphQL surface (they need a session)', () => {
      for (const p of [
        'apps/api/src/app/notes/graphql',
        'apps/api/src/app/profile/graphql',
        'apps/api/src/app/storage/graphql',
      ])
        expect(ex().has(p), p).toBe(true);
    });

    it('drops the GraphQL tests that import auth-only code', () => {
      expect(ex().has(INTEGRATION_TEST)).toBe(true);
      expect(ex().has(HEALTH_TEST)).toBe(true);
    });

    it('keeps the storage REST stack when upload is chosen (no StorageResolver)', () => {
      expect(ex().has('apps/api/src/app/storage')).toBe(false);
      expect(ex().has('apps/api/src/app/storage/storage.controller.ts')).toBe(false);
      expect(ex().has('apps/api/src/app/storage/storage.controllers.graphql.ts')).toBe(true);
    });
  });

  it('auth=none + rest: still excludes every server GraphQL artefact', () => {
    const ex = excluded({ api: 'rest', authProvider: 'none', dbProvider: 'none', example: 'none' });
    for (const p of SERVER_GRAPHQL) expect(ex.has(p), p).toBe(true);
  });
});

// Client half of the `--api` axis (spec section 8, decision 5): GraphQL client files ship only
// with api=graphql, per feature; the exclusions reach every template (apps/templates/client-<ui>).
describe('resolveBindings: api axis (client)', () => {
  const CLIENT_GRAPHQL = [
    'codegen.ts',
    'graphql-loader.d.ts',
    'src/api/graphql.ts',
    'src/api/__tests__/graphql.unit.test.ts',
    'src/gql',
    'src/graphql',
    'src/queries/notes.gql-api.ts',
    'src/queries/profile.gql-api.ts',
    'src/queries/__tests__/notes.gql-api.unit.test.ts',
    'src/queries/__tests__/profile.gql-api.unit.test.ts',
  ];
  const NOTES = [
    'src/queries/notes.gql-api.ts',
    'src/queries/__tests__/notes.gql-api.unit.test.ts',
    'src/graphql/notes.queries.ts',
    'src/graphql/gql/notes.graphql',
    'src/graphql/__tests__/operation.unit.test.ts',
  ];
  const PROFILE = [
    'src/queries/profile.gql-api.ts',
    'src/queries/__tests__/profile.gql-api.unit.test.ts',
    'src/graphql/profile.queries.ts',
    'src/graphql/gql/profile.graphql',
  ];
  const full = { ...base, example: 'notes' as const };
  const excluded = (o: Partial<CreateIcoreOptions>) =>
    resolveBindings({ ...full, ...o }).excludedPaths;
  const inEvery = (ex: ReadonlySet<string>, rel: string) =>
    ['shadcn', 'antd', 'mui'].every((ui) => ex.has(`apps/templates/client-${ui}/${rel}`));
  const inNone = (ex: ReadonlySet<string>, rel: string) =>
    ['shadcn', 'antd', 'mui'].every((ui) => !ex.has(`apps/templates/client-${ui}/${rel}`));

  it.each(['rest', 'both'] as const)('%s: excludes every GraphQL client file', (api) => {
    const ex = excluded({ api });
    for (const p of CLIENT_GRAPHQL) expect(inEvery(ex, p), p).toBe(true);
  });

  it('graphql: ships every GraphQL client file when notes and auth exist', () => {
    const ex = excluded({ api: 'graphql' });
    for (const p of [...CLIENT_GRAPHQL, ...NOTES, ...PROFILE]) expect(inNone(ex, p), p).toBe(true);
  });

  it('graphql --example=none: drops the notes operations, keeps profile and the plumbing', () => {
    const ex = excluded({ api: 'graphql', example: 'none' });
    for (const p of NOTES) expect(inEvery(ex, p), p).toBe(true);
    for (const p of [...PROFILE, 'src/api/graphql.ts', 'src/graphql/operation.ts', 'codegen.ts'])
      expect(inNone(ex, p), p).toBe(true);
  });

  it('graphql + auth=none: drops notes and profile operations, keeps the plumbing', () => {
    const ex = excluded({ api: 'graphql', authProvider: 'none', dbProvider: 'none' });
    for (const p of [...NOTES, ...PROFILE]) expect(inEvery(ex, p), p).toBe(true);
    for (const p of ['src/api/graphql.ts', 'src/graphql/operation.ts', 'codegen.ts', 'src/gql'])
      expect(inNone(ex, p), p).toBe(true);
  });
});

describe('resolveUnits — api axis', () => {
  const deps = (o: CreateIcoreOptions) => resolveUnits(o).flatMap((u) => Object.keys(u.deps));

  it('rest adds no GraphQL dependency', () => {
    const d = deps({ ...base, api: 'rest' });
    for (const n of [
      '@nestjs/graphql',
      '@nestjs/apollo',
      '@apollo/server',
      'graphql',
      'vite-plugin-graphql-loader',
    ])
      expect(d).not.toContain(n);
  });

  it('both adds the server GraphQL deps but no client deps', () => {
    const d = deps({ ...base, api: 'both' });
    for (const n of ['@nestjs/graphql', '@nestjs/apollo', '@apollo/server', 'graphql'])
      expect(d).toContain(n);
    expect(d).not.toContain('vite-plugin-graphql-loader');
    expect(resolveUnits({ ...base, api: 'both' })).not.toContain(MANIFEST.apiClient);
  });

  it('graphql adds the server deps and the client unit', () => {
    const units = resolveUnits({ ...base, api: 'graphql' });
    expect(units).toContain(MANIFEST.api.graphql);
    expect(units).toContain(MANIFEST.apiClient);
    expect(units.flatMap((u) => Object.keys(u.deps))).toContain('vite-plugin-graphql-loader');
  });

  it('graphql with ui=none has no client unit', () => {
    const units = resolveUnits({ ...base, api: 'graphql', ui: 'none' });
    expect(units).toContain(MANIFEST.api.graphql);
    expect(units).not.toContain(MANIFEST.apiClient);
  });

  it('MANIFEST.api.rest is empty', () => {
    expect(MANIFEST.api.rest).toEqual({ libDirs: [], deps: {}, tsPaths: {} });
  });
});
