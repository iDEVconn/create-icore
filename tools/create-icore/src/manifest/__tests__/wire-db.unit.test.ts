import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDbProvider, cleanupUnusedDb } from '../wire-db.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-db-'));
  await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
    `import { SupabaseDbModule } from '@icore/db-supabase';\nexport const DbProviderModule = SupabaseDbModule.forRoot('x');\n`,
  );
  for (const d of ['supabase', 'firestore', 'mongodb', 'postgres']) {
    await mkdir(join(dir, `libs/db-strategies/${d}/src`), { recursive: true });
    await writeFile(join(dir, `libs/db-strategies/${d}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/notes/package.json'),
    JSON.stringify({
      name: 'notes',
      dependencies: {
        '@icore/db-supabase': '*',
        '@icore/db-firestore': '*',
        '@supabase/supabase-js': '^2.106.2',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/db-supabase': ['libs/db-strategies/supabase/src/index.ts'],
          '@icore/db-firestore': ['libs/db-strategies/firestore/src/index.ts'],
          '@icore/db-mongodb': ['libs/db-strategies/mongodb/src/index.ts'],
          '@icore/db-postgres': ['libs/db-strategies/postgres/src/index.ts'],
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

describe('writeDbProvider', () => {
  it('wires the chosen db module (firebase → firestore lib)', async () => {
    const dir = await fixture();
    await writeDbProvider(dir, 'firebase');
    const src = await readFile(
      join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-firestore'");
    expect(src).toContain('FirestoreDbModule.forRoot');
    expect(src).not.toContain('SupabaseDbModule');
  });

  it('wires the chosen db module (postgres)', async () => {
    const dir = await fixture();
    await writeDbProvider(dir, 'postgres');
    const src = await readFile(
      join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-postgres'");
    expect(src).toContain('PostgresDbModule.forRoot');
    expect(src).not.toContain('SupabaseDbModule');
  });
});

describe('cleanupUnusedDb', () => {
  it('removes unchosen db libs (firebase→firestore dir), tsconfig paths, workspace+raw deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedDb(dir, 'firebase'); // chosen = firebase → keep firestore lib

    expect(await exists(join(dir, 'libs/db-strategies/firestore'))).toBe(true);
    expect(await exists(join(dir, 'libs/db-strategies/supabase'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/postgres'))).toBe(false);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-firestore']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js'); // supabase raw dep stripped

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/db-firestore']);
  });
});
