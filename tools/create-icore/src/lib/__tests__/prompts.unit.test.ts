import { describe, expect, it, vi } from 'vitest';

// Re-import the parser via a back-door — tests should exercise the public
// surface where possible. For Plan 7 v0.1.0 we only need to confirm CLI
// flags map to options correctly.
// (If parseFlags is not exported, export it from prompts.ts for tests.)

import { parseFlags, collectOptions } from '../prompts.js';

describe('parseFlags', () => {
  it('reads project name from the first positional arg', () => {
    expect(parseFlags(['my-app']).projectName).toBe('my-app');
  });

  it('reads --auth=firebase', () => {
    expect(parseFlags(['my-app', '--auth=firebase']).authProvider).toBe('firebase');
  });

  it('reads --db=firebase', () => {
    expect(parseFlags(['my-app', '--db=firebase']).dbProvider).toBe('firebase');
  });

  it('reads --upload=none', () => {
    expect(parseFlags(['my-app', '--upload=none']).upload).toBe('none');
  });

  it('reads --upload=cloudinary', () => {
    expect(parseFlags(['my-app', '--upload=cloudinary']).upload).toBe('cloudinary');
  });

  it('--storage is a deprecated alias that maps to upload', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = parseFlags(['my-app', '--storage=firebase']);
    expect(result.upload).toBe('firebase');
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('--storage is deprecated'));
    stderrSpy.mockRestore();
  });

  it('reads space-separated --upload flag value', () => {
    expect(parseFlags(['my-app', '--upload', 'cloudinary']).upload).toBe('cloudinary');
  });

  it('reads --payment=paypal', () => {
    expect(parseFlags(['my-app', '--payment=paypal']).payment).toBe('paypal');
  });

  it('reads --payment=none', () => {
    expect(parseFlags(['my-app', '--payment=none']).payment).toBe('none');
  });

  it('reads --jobs=bullmq', () => {
    expect(parseFlags(['my-app', '--jobs=bullmq']).jobs).toBe('bullmq');
  });

  it('reads --jobs=none', () => {
    expect(parseFlags(['my-app', '--jobs=none']).jobs).toBe('none');
  });

  it('parses --example=none', () => {
    expect(parseFlags(['my-app', '--example=none']).example).toBe('none');
  });

  it('parses --example=notes', () => {
    expect(parseFlags(['my-app', '--example=notes']).example).toBe('notes');
  });

  it('defaults example to undefined when flag absent', () => {
    expect(parseFlags(['my-app']).example).toBeUndefined();
  });

  it('honours --no-git', () => {
    expect(parseFlags(['my-app', '--no-git']).initGit).toBe(false);
  });

  it('honours --no-install', () => {
    expect(parseFlags(['my-app', '--no-install']).install).toBe(false);
  });

  it('reads --config <path> as space-separated', () => {
    expect(parseFlags(['--config', './base.json'])._configPath).toBe('./base.json');
  });

  it('reads --config=<path> as equals-separated', () => {
    expect(parseFlags(['--config=./base.json'])._configPath).toBe('./base.json');
  });

  it('reads --auth=none', () => {
    expect(parseFlags(['my-app', '--auth=none']).authProvider).toBe('none');
  });
});

// Mock @clack/prompts to prevent any interactive I/O in the test environment.
// collectOptions cascade tests only verify the cascade logic (dbProvider=none,
// example=none, transport defaulting) — not the prompt UI itself.
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  note: vi.fn(),
  text: vi.fn().mockResolvedValue('my-app'),
  select: vi.fn().mockResolvedValue(undefined),
  confirm: vi.fn().mockResolvedValue(true),
  isCancel: vi.fn().mockReturnValue(false),
}));

describe('collectOptions cascade when authProvider=none', () => {
  const baseArgv = [
    'my-app',
    '--auth=none',
    '--upload=none',
    '--payment=none',
    '--jobs=none',
    '--ui=shadcn',
    '--transport=tcp',
    '--package-manager=yarn',
    '--no-git',
    '--no-install',
  ];

  it('forces dbProvider=none without prompting', async () => {
    const opts = await collectOptions({ argv: baseArgv, cwd: '.' });
    expect(opts.dbProvider).toBe('none');
  });

  it('forces example=none without prompting', async () => {
    const opts = await collectOptions({ argv: baseArgv, cwd: '.' });
    expect(opts.example).toBe('none');
  });

  it('defaults transport to tcp when no microservices', async () => {
    const argv = [
      'my-app',
      '--auth=none',
      '--upload=none',
      '--payment=none',
      '--jobs=none',
      '--ui=shadcn',
      '--package-manager=yarn',
      '--no-git',
      '--no-install',
      // transport NOT passed — should default to tcp when all MS are none
    ];
    const opts = await collectOptions({ argv, cwd: '.' });
    expect(opts.transport).toBe('tcp');
  });
});
