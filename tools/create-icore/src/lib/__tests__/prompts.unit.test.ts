import { describe, expect, it, vi } from 'vitest';

// Re-import the parser via a back-door — tests should exercise the public
// surface where possible. For Plan 7 v0.1.0 we only need to confirm CLI
// flags map to options correctly.
// (If parseFlags is not exported, export it from prompts.ts for tests.)

import { parseFlags } from '../prompts.js';

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

  it('honours --no-git', () => {
    expect(parseFlags(['my-app', '--no-git']).initGit).toBe(false);
  });

  it('honours --no-install', () => {
    expect(parseFlags(['my-app', '--no-install']).install).toBe(false);
  });
});
