import { describe, it, expect } from 'vitest';
import { resolveUnits, resolveBindings } from '../resolve.js';
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
