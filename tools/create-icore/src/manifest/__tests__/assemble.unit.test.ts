import { describe, it, expect } from 'vitest';
import { mergeDeps, mergeTsPaths, collectEnvBlocks } from '../assemble.js';
import type { Unit } from '../types.js';

const a: Unit = {
  libDirs: [],
  deps: { '@supabase/supabase-js': '^2.106.2' },
  tsPaths: { '@icore/auth-supabase': ['libs/a/src/index.ts'] },
  envBlock: { file: '.env', lines: 'A=1' },
};
const b: Unit = {
  libDirs: [],
  deps: { cloudinary: '^2.10.0' },
  tsPaths: { '@icore/storage-cloudinary': ['libs/b/src/index.ts'] },
};

describe('assemble merge helpers', () => {
  it('mergeDeps unions all unit deps', () => {
    expect(mergeDeps([a, b])).toEqual({
      '@supabase/supabase-js': '^2.106.2',
      cloudinary: '^2.10.0',
    });
  });

  it('mergeTsPaths unions all unit tsPaths', () => {
    expect(mergeTsPaths([a, b])).toEqual({
      '@icore/auth-supabase': ['libs/a/src/index.ts'],
      '@icore/storage-cloudinary': ['libs/b/src/index.ts'],
    });
  });

  it('collectEnvBlocks returns only units that declare one', () => {
    expect(collectEnvBlocks([a, b])).toEqual([{ file: '.env', lines: 'A=1' }]);
  });
});
