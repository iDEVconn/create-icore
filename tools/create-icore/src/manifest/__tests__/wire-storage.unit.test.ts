import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStorageProvider, cleanupUnusedStorage } from '../wire-storage.js';

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-wire-storage-'));
  await mkdir(join(dir, 'apps/microservices/upload/src/app'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/upload/src/app/storage.provider.ts'),
    `import { SupabaseStorageModule } from '@icore/storage-supabase';\nexport const StorageProviderModule = SupabaseStorageModule.forRoot('x');\n`,
  );
  for (const p of ['supabase', 'firebase', 'cloudinary', 'mongodb']) {
    await mkdir(join(dir, `libs/storage-strategies/${p}/src`), { recursive: true });
    await writeFile(join(dir, `libs/storage-strategies/${p}/src/index.ts`), 'export {};');
  }
  await writeFile(
    join(dir, 'apps/microservices/upload/package.json'),
    JSON.stringify({
      name: 'upload',
      dependencies: {
        '@icore/storage-supabase': '*',
        '@icore/storage-firebase': '*',
        '@icore/storage-cloudinary': '*',
        '@icore/storage-mongodb': '*',
        '@supabase/supabase-js': '^2.106.2',
        cloudinary: '^2.0.0',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/storage-supabase': ['libs/storage-strategies/supabase/src/index.ts'],
          '@icore/storage-firebase': ['libs/storage-strategies/firebase/src/index.ts'],
          '@icore/storage-cloudinary': ['libs/storage-strategies/cloudinary/src/index.ts'],
          '@icore/storage-mongodb': ['libs/storage-strategies/mongodb/src/index.ts'],
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

describe('writeStorageProvider', () => {
  it('writes storage.provider.ts wiring the chosen provider module', async () => {
    const dir = await fixture();
    await writeStorageProvider(dir, 'cloudinary');
    const src = await readFile(
      join(dir, 'apps/microservices/upload/src/app/storage.provider.ts'),
      'utf8',
    );
    expect(src).toContain("from '@icore/storage-cloudinary'");
    expect(src).toContain('CloudinaryStorageModule.forRoot');
    expect(src).not.toContain('SupabaseStorageModule');
  });
});

describe('cleanupUnusedStorage', () => {
  it('removes unchosen libs, their tsconfig paths, workspace+raw deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedStorage(dir, 'supabase');

    expect(await exists(join(dir, 'libs/storage-strategies/firebase'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/cloudinary'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/supabase'))).toBe(true);

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/upload/package.json'), 'utf8'),
    );
    // chosen workspace dep + its raw SDK kept; unchosen workspace + raw cloudinary gone
    expect(pkg.dependencies['@icore/storage-supabase']).toBe('*');
    expect(pkg.dependencies['@supabase/supabase-js']).toBe('^2.106.2');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-cloudinary');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-firebase');
    expect(pkg.dependencies).not.toHaveProperty('cloudinary');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/storage-supabase']);
  });
});
