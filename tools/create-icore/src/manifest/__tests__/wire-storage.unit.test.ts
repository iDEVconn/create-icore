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
  for (const p of ['supabase', 'firebase', 'cloudinary', 'mongodb', 'minio', 'r2']) {
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
        '@icore/storage-minio': '*',
        '@icore/storage-r2': '*',
        '@supabase/supabase-js': '^2.106.2',
        cloudinary: '^2.0.0',
        minio: '^8.0.6',
        '@aws-sdk/client-s3': '^3.1153.0',
        '@aws-sdk/s3-request-presigner': '^3.1153.0',
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
          '@icore/storage-minio': ['libs/storage-strategies/minio/src/index.ts'],
          '@icore/storage-r2': ['libs/storage-strategies/r2/src/index.ts'],
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

  it('wires R2StorageModule from @icore/storage-r2 and declares its AWS SDK deps', async () => {
    const dir = await fixture();
    await writeStorageProvider(dir, 'r2');
    const src = await readFile(
      join(dir, 'apps/microservices/upload/src/app/storage.provider.ts'),
      'utf8',
    );
    expect(src).toContain("import { R2StorageModule } from '@icore/storage-r2'");
    expect(src).toContain('R2StorageModule.forRoot');
    expect(src).not.toContain('SupabaseStorageModule');

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/upload/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/storage-r2']).toBe('*');
    expect(pkg.dependencies['@aws-sdk/client-s3']).toBe('^3.1153.0');
    expect(pkg.dependencies['@aws-sdk/s3-request-presigner']).toBe('^3.1153.0');
  });
});

describe('cleanupUnusedStorage', () => {
  it('removes unchosen libs, their tsconfig paths, workspace+raw deps; keeps chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedStorage(dir, 'supabase');

    expect(await exists(join(dir, 'libs/storage-strategies/firebase'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/cloudinary'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/mongodb'))).toBe(false);
    expect(await exists(join(dir, 'libs/storage-strategies/r2'))).toBe(false);
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
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-r2');
    expect(pkg.dependencies).not.toHaveProperty('@aws-sdk/client-s3');
    expect(pkg.dependencies).not.toHaveProperty('@aws-sdk/s3-request-presigner');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/storage-supabase']);
  });

  it('keeps r2 (and its AWS SDK deps) and removes minio + the minio dep when r2 is chosen', async () => {
    const dir = await fixture();
    await cleanupUnusedStorage(dir, 'r2');

    expect(await exists(join(dir, 'libs/storage-strategies/r2'))).toBe(true);
    for (const p of ['supabase', 'firebase', 'cloudinary', 'mongodb', 'minio']) {
      expect(await exists(join(dir, `libs/storage-strategies/${p}`))).toBe(false);
    }

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/upload/package.json'), 'utf8'),
    );
    expect(pkg.dependencies['@icore/storage-r2']).toBe('*');
    expect(pkg.dependencies['@aws-sdk/client-s3']).toBe('^3.1153.0');
    expect(pkg.dependencies['@aws-sdk/s3-request-presigner']).toBe('^3.1153.0');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-minio');
    expect(pkg.dependencies).not.toHaveProperty('minio');

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(Object.keys(ts.compilerOptions.paths)).toEqual(['@icore/storage-r2']);
  });
});
