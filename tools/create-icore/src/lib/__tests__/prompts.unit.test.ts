import { describe, expect, it } from 'vitest';

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

  it('reads space-separated flag value', () => {
    expect(parseFlags(['my-app', '--storage', 'cloudinary']).storageProvider).toBe('cloudinary');
  });

  it('honours --no-git', () => {
    expect(parseFlags(['my-app', '--no-git']).initGit).toBe(false);
  });

  it('honours --no-install', () => {
    expect(parseFlags(['my-app', '--no-install']).install).toBe(false);
  });
});
