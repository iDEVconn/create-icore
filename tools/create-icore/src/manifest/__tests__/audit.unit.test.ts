import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditProject } from '../audit.js';

async function scaffold(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-audit-'));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), content);
  }
  return dir;
}

describe('auditProject', () => {
  it('flags an import of an @icore package whose alias is absent from tsconfig', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `import { X } from '@icore/auth-firebase';`,
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'import-of-absent-lib',
        detail: expect.stringContaining('@icore/auth-firebase'),
      }),
    );
  });

  it('passes when every imported @icore alias exists in tsconfig paths', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { paths: { '@icore/auth-supabase': ['libs/a/src/index.ts'] } },
      }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `import { X } from '@icore/auth-supabase';`,
    });
    expect(await auditProject(dir)).toEqual([]);
  });

  it('tolerates a trailing comma in tsconfig paths (no false-positive orphan)', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': `{
  "compilerOptions": {
    "paths": {
      "@icore/auth-supabase": ["libs/a/src/index.ts"],
    }
  }
}`,
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `import { X } from '@icore/auth-supabase';`,
    });
    expect(await auditProject(dir)).toEqual([]);
  });

  it('flags an @icore package brought in via a dynamic import whose alias is absent', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/x/src/a.ts': `const m = import('@icore/auth-firebase');`,
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'import-of-absent-lib',
        detail: expect.stringContaining('@icore/auth-firebase'),
      }),
    );
  });

  it('flags a forbidden raw SDK dep passed via opts.forbiddenDeps', async () => {
    const dir = await scaffold({
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: { cloudinary: '^2.10.0' } }),
    });
    const v = await auditProject(dir, { forbiddenDeps: ['cloudinary'] });
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('cloudinary'),
      }),
    );
  });
});

describe('auditProject blueprint-derived forbidden deps', () => {
  it('flags a forbidden raw SDK in any package.json when its provider is unchosen', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      // supabase chosen → @supabase/supabase-js OK; cloudinary NOT chosen → forbidden
      'apps/microservices/upload/package.json': JSON.stringify({
        dependencies: { '@supabase/supabase-js': '^2', cloudinary: '^2' },
      }),
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('cloudinary'),
      }),
    );
    // supabase SDK is chosen → NOT flagged
    expect(v.some((x) => x.detail.includes('@supabase/supabase-js'))).toBe(false);
  });

  it('flags firebase-admin when no axis uses firebase', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'supabase',
        dbProvider: 'mongodb',
        upload: 'none',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: {} }),
      'apps/microservices/auth/package.json': JSON.stringify({
        dependencies: { '@icore/firebase-admin': '*' },
      }),
    });
    const v = await auditProject(dir);
    expect(v).toContainEqual(
      expect.objectContaining({
        kind: 'forbidden-dep',
        detail: expect.stringContaining('@icore/firebase-admin'),
      }),
    );
  });

  it('passes when every present dep matches the chosen providers', async () => {
    const dir = await scaffold({
      'blueprint.json': JSON.stringify({
        schemaVersion: 1,
        projectName: 'x',
        authProvider: 'mongodb',
        dbProvider: 'mongodb',
        upload: 'cloudinary',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'npm',
      }),
      'tsconfig.base.json': JSON.stringify({ compilerOptions: { paths: {} } }),
      'package.json': JSON.stringify({ dependencies: { mongoose: '^9', cloudinary: '^2' } }),
    });
    expect(await auditProject(dir)).toEqual([]);
  });
});
