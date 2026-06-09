import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthProvider, cleanupUnusedAuth } from '../wire-auth.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-'));
  // auth provider + app dirs
  await mkdir(join(dir, 'apps/microservices/auth/src/app/__tests__'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/auth/src/app/auth.provider.ts'),
    `import { SupabaseAuthModule } from '@icore/auth-supabase';\nexport const AuthProviderModule = SupabaseAuthModule.forRoot('x');\n`,
  );
  for (const p of ['supabase', 'firebase']) {
    await writeFile(
      join(
        dir,
        `apps/microservices/auth/src/app/__tests__/auth.controller.${p}.integration.unit.test.ts`,
      ),
      `// ${p} controller test`,
    );
  }
  // lib dirs
  for (const p of ['supabase', 'firebase', 'mongodb']) {
    await mkdir(join(dir, `libs/auth-strategies/${p}/src`), { recursive: true });
    await writeFile(join(dir, `libs/auth-strategies/${p}/src/index.ts`), 'export {};');
  }
  // auth package.json with all workspace deps + tsconfig with all aliases
  await writeFile(
    join(dir, 'apps/microservices/auth/package.json'),
    JSON.stringify({
      name: 'auth',
      dependencies: {
        '@icore/auth-supabase': '*',
        '@icore/auth-firebase': '*',
        '@icore/auth-mongodb': '*',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'],
          '@icore/auth-firebase': ['libs/auth-strategies/firebase/src/index.ts'],
          '@icore/auth-mongodb': ['libs/auth-strategies/mongodb/src/index.ts'],
        },
      },
    }),
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeAuthProvider', () => {
  it('writes auth.provider.ts wiring the chosen provider module', async () => {
    const dir = await fixture();
    await writeAuthProvider(dir, 'firebase');
    const src = await readFile(
      join(dir, 'apps/microservices/auth/src/app/auth.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/auth-firebase'");
    expect(src).toContain('FirebaseAuthModule.forRoot');
    expect(src).not.toContain('SupabaseAuthModule');
  });
});

describe('cleanupUnusedAuth', () => {
  it('removes unchosen libs, their controller tests, deps and tsconfig paths; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedAuth(dir, 'supabase');

    // unchosen libs gone, chosen kept
    expect(await exists(join(dir, 'libs/auth-strategies/firebase'))).toBe(false);
    expect(await exists(join(dir, 'libs/auth-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/auth-strategies/supabase'))).toBe(true);

    // firebase controller test removed; supabase kept
    expect(
      await exists(
        join(
          dir,
          'apps/microservices/auth/src/app/__tests__/auth.controller.firebase.integration.unit.test.ts',
        ),
      ),
    ).toBe(false);
    expect(
      await exists(
        join(
          dir,
          'apps/microservices/auth/src/app/__tests__/auth.controller.supabase.integration.unit.test.ts',
        ),
      ),
    ).toBe(true);

    // deps + tsconfig pruned to supabase only
    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'),
    );
    expect(pkg.dependencies).toEqual({ '@icore/auth-supabase': '*' });
    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/auth-supabase']);
  });
});
