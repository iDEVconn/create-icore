import { describe, expect, it, vi } from 'vitest';

// Re-import the parser via a back-door — tests should exercise the public
// surface where possible. For Plan 7 v0.1.0 we only need to confirm CLI
// flags map to options correctly.
// (If parseFlags is not exported, export it from prompts.ts for tests.)

import * as clack from '@clack/prompts';
import { parseFlags, collectOptions } from '../prompts.js';

describe('parseFlags', () => {
  it('reads project name from the first positional arg', () => {
    expect(parseFlags(['my-app']).projectName).toBe('my-app');
  });

  it('reads --auth=firebase', () => {
    expect(parseFlags(['my-app', '--auth=firebase']).authProvider).toBe('firebase');
  });

  it('reads --session=memory', () => {
    expect(parseFlags(['my-app', '--session=memory']).session).toBe('memory');
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

  it('reads --ai=llm-router', () => {
    expect(parseFlags(['my-app', '--ai=llm-router']).ai).toBe('llm-router');
  });

  it('reads --ai=none', () => {
    expect(parseFlags(['my-app', '--ai=none']).ai).toBe('none');
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
    '--ai=none',
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
      '--ai=none',
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

describe('collectOptions — session store', () => {
  const argv = (extra: string[]) => [
    'my-app',
    '--auth=supabase',
    '--db=supabase',
    '--upload=none',
    '--payment=none',
    '--jobs=none',
    '--ai=none',
    '--example=none',
    '--ui=shadcn',
    '--transport=tcp',
    '--package-manager=yarn',
    '--no-git',
    '--no-install',
    ...extra,
  ];

  it('takes --session without asking', async () => {
    const opts = await collectOptions({ argv: argv(['--session=memory']), cwd: '.' });
    expect(opts.session).toBe('memory');
  });

  it('does not ask for a session store when auth=none (there are no sessions) and uses redis', async () => {
    const opts = await collectOptions({
      argv: [
        'my-app',
        '--auth=none',
        '--upload=none',
        '--payment=none',
        '--jobs=none',
        '--ai=none',
        '--ui=shadcn',
        '--transport=tcp',
        '--package-manager=yarn',
        '--no-git',
        '--no-install',
      ],
      cwd: '.',
    });
    expect(opts.session).toBe('redis');
  });
});

describe('collectOptions — flag validation', () => {
  const valid = [
    'my-app',
    '--auth=none',
    '--upload=none',
    '--payment=none',
    '--jobs=bullmq',
    '--ai=none',
    '--ui=shadcn',
    '--transport=redis',
    '--package-manager=yarn',
    '--no-git',
    '--no-install',
  ];
  const withFlag = (flag: string) =>
    valid.map((a) => (a.startsWith(flag.split('=')[0] + '=') ? flag : a));

  it.each([
    ['--package-manager=yarn.', 'flag "packageManager" got "yarn."'],
    ['--ui=', 'flag "ui" got ""'],
    ['--transport=redsi', 'flag "transport" got "redsi"'],
  ])('rejects %s before scaffolding', async (flag, message) => {
    await expect(collectOptions({ argv: withFlag(flag), cwd: '.' })).rejects.toThrow(message);
  });

  it('rejects an unknown --db value', async () => {
    await expect(collectOptions({ argv: [...valid, '--db=sqlit'], cwd: '.' })).rejects.toThrow(
      'flag "dbProvider" got "sqlit"',
    );
  });

  it('accepts a valid flag set unchanged', async () => {
    const opts = await collectOptions({ argv: valid, cwd: '.' });
    expect(opts.packageManager).toBe('yarn');
    expect(opts.transport).toBe('redis');
  });
});

describe('parseFlags — separators and unknown flags', () => {
  it('skips the `--` that `yarn create <pkg> <name> -- …` forwards', () => {
    const flags = parseFlags(['my-app', '--', '--db=sqlite', '--jobs=bullmq']);
    expect(flags.projectName).toBe('my-app');
    expect(flags.dbProvider).toBe('sqlite');
    expect(flags.jobs).toBe('bullmq');
  });

  it('reads --db=d1 and --upload=r2', () => {
    const flags = parseFlags(['my-app', '--db=d1', '--upload=r2']);
    expect(flags.dbProvider).toBe('d1');
    expect(flags.upload).toBe('r2');
  });

  it('warns on an unknown flag instead of silently ignoring it', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    parseFlags(['my-app', '--packge-manager=yarn']);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown flag --packge-manager'),
    );
    stderrSpy.mockRestore();
  });
});

describe('collectOptions — wizard provider options', () => {
  it('offers Cloudflare D1 as a database backend and Cloudflare R2 as an upload provider', async () => {
    const select = vi.mocked(clack.select);
    select.mockImplementation((async (o: { message: string }) =>
      o.message === 'Database backend'
        ? 'd1'
        : o.message === 'File upload provider'
          ? 'r2'
          : undefined) as unknown as typeof clack.select);
    try {
      const opts = await collectOptions({
        argv: [
          'my-app',
          '--auth=supabase',
          '--payment=none',
          '--jobs=none',
          '--ai=none',
          '--example=notes',
          '--ui=shadcn',
          '--transport=tcp',
          '--session=redis',
          '--package-manager=yarn',
          '--no-git',
          '--no-install',
        ],
        cwd: '.',
      });
      const optionsFor = (message: string) =>
        (
          select.mock.calls.find(([o]) => o.message === message)?.[0] as {
            options: { value: string; label: string }[];
          }
        ).options;
      expect(optionsFor('Database backend')).toContainEqual({
        value: 'd1',
        label: 'Cloudflare D1 (SQLite over REST)',
      });
      expect(optionsFor('File upload provider')).toContainEqual({
        value: 'r2',
        label: 'Cloudflare R2 (S3-compatible)',
      });
      expect(opts.dbProvider).toBe('d1');
      expect(opts.upload).toBe('r2');
    } finally {
      select.mockReset();
      select.mockResolvedValue(undefined);
    }
  });
});
