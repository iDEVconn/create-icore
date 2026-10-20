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
  for (const d of ['supabase', 'firestore', 'mongodb', 'postgres', 'sqlite', 'd1']) {
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
        '@icore/db-mongodb': '*',
        '@icore/db-postgres': '*',
        '@icore/db-sqlite': '*',
        '@icore/db-d1': '*',
        '@supabase/supabase-js': '^2.106.2',
        'better-sqlite3': '^11.8.1',
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
          '@icore/db-sqlite': ['libs/db-strategies/sqlite/src/index.ts'],
          '@icore/db-d1': ['libs/db-strategies/d1/src/index.ts'],
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

  it('wires the chosen db module (sqlite)', async () => {
    const dir = await fixture();
    await writeDbProvider(dir, 'sqlite');
    const src = await readFile(
      join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/db-sqlite'");
    expect(src).toContain('SqliteDbModule.forRoot');
    expect(src).not.toContain('SupabaseDbModule');
  });

  it('wires the chosen db module (d1)', async () => {
    const dir = await fixture();
    await writeDbProvider(dir, 'd1');
    const src = await readFile(
      join(dir, 'apps/microservices/notes/src/app/db.provider.ts'),
      'utf8',
    );
    expect(src).toContain("import { D1DbModule } from '@icore/db-d1'");
    expect(src).toContain('D1DbModule.forRoot');
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
    expect(await exists(join(dir, 'libs/db-strategies/sqlite'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/d1'))).toBe(false);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-firestore']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-postgres');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-sqlite');
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js'); // supabase raw dep stripped
    expect(pkg.dependencies).not.toHaveProperty('better-sqlite3');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/db-firestore']);
  });

  it('cleans up unchosen and keeps sqlite when sqlite is chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedDb(dir, 'sqlite');

    expect(await exists(join(dir, 'libs/db-strategies/sqlite'))).toBe(true);
    expect(await exists(join(dir, 'libs/db-strategies/supabase'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/firestore'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/db-strategies/postgres'))).toBe(false);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-sqlite']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-firestore');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-postgres');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/db-sqlite']);
  });

  it('cleans up unchosen and keeps d1 when d1 is chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedDb(dir, 'd1');

    expect(await exists(join(dir, 'libs/db-strategies/d1'))).toBe(true);
    for (const d of ['supabase', 'firestore', 'mongodb', 'postgres', 'sqlite']) {
      expect(await exists(join(dir, `libs/db-strategies/${d}`))).toBe(false);
    }

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/db-d1']).toBe('*');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-sqlite');
    expect(pkg.dependencies).not.toHaveProperty('better-sqlite3');
    expect(pkg.dependencies).not.toHaveProperty('@supabase/supabase-js');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/db-d1']);
  });
});
