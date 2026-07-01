import { describe, it, expect } from 'vitest';
import { validateOptions } from '../options.js';
import type { CreateIcoreOptions } from '../options.js';

const base: CreateIcoreOptions = {
  projectName: 'test',
  targetDir: '/tmp/test',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'none',
  jobs: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

describe('validateOptions', () => {
  it('returns no warnings for a valid combination', () => {
    const { warnings } = validateOptions(base);
    expect(warnings).toHaveLength(0);
  });

  it('warns and corrects example when auth=none + example=notes', () => {
    const opts = { ...base, authProvider: 'none' as const, example: 'notes' as const };
    const { warnings, corrected } = validateOptions(opts);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/notes example requires auth/);
    expect(corrected.example).toBe('none');
  });

  it('does not warn when auth=none + example=none', () => {
    const opts = { ...base, authProvider: 'none' as const, example: 'none' as const };
    const { warnings } = validateOptions(opts);
    expect(warnings).toHaveLength(0);
  });

  it('warns when jobs=bullmq + transport=tcp (no Redis)', () => {
    const opts = { ...base, jobs: 'bullmq' as const, transport: 'tcp' as const };
    const { warnings } = validateOptions(opts);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/BullMQ requires Redis/);
    expect(warnings[0]).toMatch(/"tcp"/);
  });

  it('does not warn when jobs=bullmq + transport=redis', () => {
    const opts = { ...base, jobs: 'bullmq' as const, transport: 'redis' as const };
    const { warnings } = validateOptions(opts);
    expect(warnings).toHaveLength(0);
  });

  it('warns for both incompatibilities simultaneously', () => {
    const opts = {
      ...base,
      authProvider: 'none' as const,
      example: 'notes' as const,
      jobs: 'bullmq' as const,
      transport: 'tcp' as const,
    };
    const { warnings, corrected } = validateOptions(opts);
    expect(warnings).toHaveLength(2);
    expect(corrected.example).toBe('none');
  });

  it('does not mutate the original options object', () => {
    const opts = { ...base, authProvider: 'none' as const, example: 'notes' as const };
    validateOptions(opts);
    expect(opts.example).toBe('notes');
  });
});
