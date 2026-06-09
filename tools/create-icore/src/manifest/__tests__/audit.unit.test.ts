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

  it('flags a forbidden raw SDK dep listed in FORBIDDEN', async () => {
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
