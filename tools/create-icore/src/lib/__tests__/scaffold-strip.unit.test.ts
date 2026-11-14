import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  removeFirebaseAdminLib,
  pruneApiExpressDep,
  pruneUnusedLibDeps,
  pruneUnusedAiUsageApiDep,
  pruneClientDeps,
} from '../scaffold-strip.js';

describe('removeFirebaseAdminLib', () => {
  it('silently no-ops when tsconfig.base.json does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-scaffold-strip-'));

    // Should not throw
    await expect(removeFirebaseAdminLib(dir)).resolves.not.toThrow();
  });

  it('propagates a real error (e.g., malformed JSON) instead of swallowing it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-scaffold-strip-malformed-'));

    // Write a malformed tsconfig.base.json (invalid JSON)
    await writeFile(join(dir, 'tsconfig.base.json'), '{ invalid json }');

    // Should throw when trying to parse the malformed JSON
    await expect(removeFirebaseAdminLib(dir)).rejects.toThrow();
  });
});

describe('pruneApiExpressDep', () => {
  it('strips express + @types/express when no source file imports express', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-express-'));
    const src = join(dir, 'apps/api/src');
    await mkdir(src, { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify(
        { dependencies: { express: '^4.18.0' }, devDependencies: { '@types/express': '^4.17.0' } },
        null,
        2,
      ),
    );
    await writeFile(
      join(src, 'main.ts'),
      `import { NestFactory } from '@nestjs/core';
`,
    );

    await pruneApiExpressDep(dir);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['express']).toBeUndefined();
    expect(pkg.devDependencies?.['@types/express']).toBeUndefined();
  });

  it('keeps express when a source file imports it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-express-keep-'));
    const src = join(dir, 'apps/api/src');
    await mkdir(src, { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify(
        { dependencies: { express: '^4.18.0' }, devDependencies: { '@types/express': '^4.17.0' } },
        null,
        2,
      ),
    );
    await writeFile(
      join(src, 'middleware.ts'),
      `import { Request, Response } from 'express';
`,
    );

    await pruneApiExpressDep(dir);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['express']).toBe('^4.18.0');
    expect(pkg.devDependencies?.['@types/express']).toBe('^4.17.0');
  });

  it('no-ops silently when apps/api/src does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-express-nodir-'));
    await expect(pruneApiExpressDep(dir)).resolves.not.toThrow();
  });
});

describe('pruneUnusedAiUsageApiDep', () => {
  it('strips @idevconn/ai-usage from apps/api/package.json when ai=none', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-ai-usage-'));
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify({ dependencies: { '@idevconn/ai-usage': '^0.4.0' } }, null, 2),
    );

    await pruneUnusedAiUsageApiDep(dir, 'none');

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@idevconn/ai-usage']).toBeUndefined();
  });

  it('keeps @idevconn/ai-usage when ai is not none', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-ai-usage-keep-'));
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify({ dependencies: { '@idevconn/ai-usage': '^0.4.0' } }, null, 2),
    );

    await pruneUnusedAiUsageApiDep(dir, 'llm-router');

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@idevconn/ai-usage']).toBe('^0.4.0');
  });
});

describe('pruneUnusedLibDeps', () => {
  it('strips @casl/ability from libs/shared when nothing imports it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-lib-'));
    const sharedSrc = join(dir, 'libs/shared/src');
    await mkdir(sharedSrc, { recursive: true });
    await writeFile(
      join(dir, 'libs/shared/package.json'),
      JSON.stringify({ dependencies: { '@casl/ability': '^6.0.0', rxjs: '^7.0.0' } }, null, 2),
    );
    await writeFile(
      join(sharedSrc, 'index.ts'),
      `export const foo = 1;
`,
    );

    const tplSrc = join(dir, 'libs/template-shared/src');
    await mkdir(tplSrc, { recursive: true });
    await writeFile(
      join(dir, 'libs/template-shared/package.json'),
      JSON.stringify(
        { dependencies: { '@casl/react': '^6.0.0', '@icore/shared': '^1.0.0' } },
        null,
        2,
      ),
    );
    await writeFile(
      join(tplSrc, 'index.ts'),
      `export const bar = 2;
`,
    );

    await pruneUnusedLibDeps(dir);

    const sharedPkg = JSON.parse(await readFile(join(dir, 'libs/shared/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(sharedPkg.dependencies?.['@casl/ability']).toBeUndefined();
    expect(sharedPkg.dependencies?.['rxjs']).toBe('^7.0.0');

    const tplPkg = JSON.parse(
      await readFile(join(dir, 'libs/template-shared/package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(tplPkg.dependencies?.['@casl/react']).toBeUndefined();
    expect(tplPkg.dependencies?.['@icore/shared']).toBeUndefined();
  });

  it('keeps @casl/ability when a source file imports it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-lib-keep-'));
    const sharedSrc = join(dir, 'libs/shared/src');
    await mkdir(sharedSrc, { recursive: true });
    await writeFile(
      join(dir, 'libs/shared/package.json'),
      JSON.stringify({ dependencies: { '@casl/ability': '^6.0.0' } }, null, 2),
    );
    await writeFile(
      join(sharedSrc, 'abilities.ts'),
      `import { AbilityBuilder } from '@casl/ability';
`,
    );

    const tplSrc = join(dir, 'libs/template-shared/src');
    await mkdir(tplSrc, { recursive: true });
    await writeFile(
      join(dir, 'libs/template-shared/package.json'),
      JSON.stringify(
        { dependencies: { '@casl/react': '^6.0.0', '@icore/shared': '^1.0.0' } },
        null,
        2,
      ),
    );
    await writeFile(
      join(tplSrc, 'can.tsx'),
      `import { Can } from '@casl/react';
import type { AppAbility } from '@icore/shared';
`,
    );

    await pruneUnusedLibDeps(dir);

    const sharedPkg = JSON.parse(await readFile(join(dir, 'libs/shared/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(sharedPkg.dependencies?.['@casl/ability']).toBe('^6.0.0');

    const tplPkg = JSON.parse(
      await readFile(join(dir, 'libs/template-shared/package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
    };
    expect(tplPkg.dependencies?.['@casl/react']).toBe('^6.0.0');
    expect(tplPkg.dependencies?.['@icore/shared']).toBe('^1.0.0');
  });
});

describe('pruneClientDeps', () => {
  async function fixture(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-client-'));
    await mkdir(join(dir, 'apps/api/src'), { recursive: true });
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        dependencies: {
          react: '^19',
          'react-dom': '^19',
          zustand: '^5',
          '@tanstack/react-query': '^5',
          '@nestjs/core': '^11',
        },
        devDependencies: {
          vite: '^8',
          '@vitejs/plugin-react': '^5',
          '@nx/react': '^24',
          'eslint-plugin-react': '^7',
          typescript: '^6',
        },
      }),
    );
    return dir;
  }

  async function depsOf(dir: string): Promise<string[]> {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    return [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)];
  }

  it('removes client-only deps that no remaining source references, keeps everything else', async () => {
    const dir = await fixture();
    await writeFile(
      join(dir, 'apps/api/src/main.ts'),
      "import { NestFactory } from '@nestjs/core';",
    );

    await pruneClientDeps(dir);

    const deps = await depsOf(dir);
    for (const gone of [
      'react',
      'react-dom',
      'zustand',
      '@tanstack/react-query',
      '@vitejs/plugin-react',
      '@nx/react', // peers react/react-dom: leaving it would reinstall React
      'eslint-plugin-react',
    ]) {
      expect(deps, gone).not.toContain(gone);
    }
    expect(deps).toEqual(expect.arrayContaining(['@nestjs/core', 'typescript', 'vite']));
  });

  it('keeps a candidate dep that a remaining source or config file still references', async () => {
    const dir = await fixture();
    await writeFile(join(dir, 'apps/api/src/store.ts'), "import { create } from 'zustand';");
    await writeFile(join(dir, 'eslint.config.mjs'), "import react from 'eslint-plugin-react';");

    await pruneClientDeps(dir);

    const deps = await depsOf(dir);
    expect(deps).toEqual(expect.arrayContaining(['zustand', 'eslint-plugin-react']));
    expect(deps).not.toContain('react');
  });

  it('silently no-ops when package.json does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-prune-client-empty-'));
    await expect(pruneClientDeps(dir)).resolves.not.toThrow();
  });
});
