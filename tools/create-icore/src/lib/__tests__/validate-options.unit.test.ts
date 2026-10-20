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
  ai: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  session: 'redis',
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

  it('ignores --session=memory when auth=none (no sessions at all) and says so', () => {
    const { warnings, corrected } = validateOptions({
      ...base,
      authProvider: 'none' as const,
      example: 'none' as const,
      session: 'memory' as const,
    });
    expect(corrected.session).toBe('redis');
    expect(warnings.join(' ')).toMatch(/--session.*auth=none/);
  });

  it('keeps session=memory for an authenticated project', () => {
    expect(validateOptions({ ...base, session: 'memory' as const }).corrected.session).toBe(
      'memory',
    );
  });

  describe('host', () => {
    const cf: CreateIcoreOptions = {
      ...base,
      host: 'cloudflare',
      dbProvider: 'd1',
      upload: 'r2',
      transport: 'local',
      session: 'durable-object',
    };

    it('treats a missing host as node and has no errors', () => {
      expect(validateOptions(base).errors).toEqual([]);
    });

    it('accepts the supported Cloudflare combination without errors or warnings', () => {
      const r = validateOptions(cf);
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    });

    it('fills in transport=local and session=durable-object for host=cloudflare', () => {
      const { corrected, errors } = validateOptions({ ...cf, transport: 'tcp', session: 'redis' });
      expect(errors).toEqual([]);
      expect(corrected.transport).toBe('local');
      expect(corrected.session).toBe('durable-object');
    });

    it('rejects a transport or session that is not the Worker one', () => {
      expect(validateOptions({ ...cf, transport: 'nats' }).errors.join()).toMatch(/transport/);
      expect(validateOptions({ ...cf, session: 'memory' }).errors.join()).toMatch(/session/);
    });

    it.each([
      ['authProvider', 'firebase'],
      ['dbProvider', 'postgres'],
      ['upload', 'minio'],
      ['payment', 'paypal'],
      ['jobs', 'bullmq'],
      ['ai', 'llm-router'],
    ])('rejects %s=%s on Cloudflare and names the supported values', (key, value) => {
      const { errors } = validateOptions({ ...cf, [key]: value });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(value);
      expect(errors[0]).toMatch(/--host=cloudflare/);
    });

    it('allows db=none and upload=none on Cloudflare', () => {
      expect(
        validateOptions({ ...cf, dbProvider: 'none', upload: 'none', example: 'none' }).errors,
      ).toEqual([]);
    });

    it('rejects Cloudflare-only transport/session values on host=node', () => {
      expect(validateOptions({ ...base, transport: 'local' }).errors.join()).toMatch(
        /host=cloudflare/,
      );
      expect(validateOptions({ ...base, session: 'durable-object' }).errors.join()).toMatch(
        /host=cloudflare/,
      );
    });

    it('rejects d1/r2 nothing on node (they stay usable with the Node host)', () => {
      expect(validateOptions({ ...base, dbProvider: 'd1', upload: 'r2' }).errors).toEqual([]);
    });
  });
});
