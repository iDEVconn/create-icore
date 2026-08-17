import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeAuthTsconfigPaths } from '../scaffold-auth-none.js';

// removeAuthTsconfigPaths loops over 4 aliases in this order:
//   @icore/auth-client, @icore/auth-supabase, @icore/auth-firebase, @icore/auth-mongodb
// stripTsconfigPath()'s regex removes each alias's whole line (including its
// own trailing comma). When the LAST alias processed (@icore/auth-mongodb) is
// also the last key in the `paths` object, its line has no trailing comma to
// strip — so removing it leaves the *preceding* surviving entry's comma
// dangling before the closing `}`, producing invalid JSON.
async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-authnone-tsconfig-'));
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    '{\n' +
      '  "compilerOptions": {\n' +
      '    "paths": {\n' +
      '      "@icore/shared": ["libs/shared/src/index.ts"],\n' +
      '      "@icore/auth-client": ["libs/auth-client/src/index.ts"],\n' +
      '      "@icore/auth-supabase": ["libs/auth-strategies/supabase/src/index.ts"],\n' +
      '      "@icore/auth-firebase": ["libs/auth-strategies/firebase/src/index.ts"],\n' +
      '      "@icore/auth-mongodb": ["libs/auth-strategies/mongodb/src/index.ts"],\n' +
      '      "@icore/auth-postgres": ["libs/auth-strategies/postgres/src/index.ts"]\n' +
      '    }\n' +
      '  }\n' +
      '}\n',
  );
  return dir;
}

describe('removeAuthTsconfigPaths', () => {
  it('leaves valid, parseable JSON with no dangling comma when the last-removed alias was positioned last in paths', async () => {
    const dir = await fixture();

    await removeAuthTsconfigPaths(dir);

    const out = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');

    expect(() => JSON.parse(out)).not.toThrow();
    expect(out).not.toMatch(/,(\s*[\]}])/);

    const parsed = JSON.parse(out) as { compilerOptions: { paths: Record<string, unknown> } };
    expect(parsed.compilerOptions.paths).toEqual({
      '@icore/shared': ['libs/shared/src/index.ts'],
    });
  });
});
