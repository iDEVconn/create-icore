import { describe, it, expect } from 'vitest';
import { resolveUnits } from '../resolve.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '/tmp/x',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  example: 'none',
  ui: 'shadcn',
  transport: 'tcp',
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
});
