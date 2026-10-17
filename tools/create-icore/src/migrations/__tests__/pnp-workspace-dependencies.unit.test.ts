import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import migrate from '../../../migrations/codemods/pnp-workspace-dependencies.js';

describe('pnp-workspace-dependencies codemod', () => {
  it('patches pre-fix workspace package manifests with required PnP dependencies', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pnp-migration-'));

    // 1. Root package.json (no webpack)
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-app', devDependencies: { nx: '23.2.1' } }),
    );

    // 2. apps/api/package.json (bare)
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify({
        name: 'api',
        devDependencies: { '@types/express': '^5.0.6' },
        dependencies: { '@nestjs/common': '^11.2.7' },
      }),
    );

    // 3. apps/client/package.json (bare)
    await mkdir(join(dir, 'apps/client'), { recursive: true });
    await writeFile(
      join(dir, 'apps/client/package.json'),
      JSON.stringify({
        name: 'client-shadcn',
        dependencies: { clsx: '^2.1.1' },
      }),
    );

    // 4. apps/microservices/jobs/package.json (bare)
    await mkdir(join(dir, 'apps/microservices/jobs'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/jobs/package.json'),
      JSON.stringify({
        name: 'jobs',
        dependencies: { bullmq: '^6.3.11' },
      }),
    );

    // 5. libs/shared/package.json (bare)
    await mkdir(join(dir, 'libs/shared'), { recursive: true });
    await writeFile(
      join(dir, 'libs/shared/package.json'),
      JSON.stringify({
        name: '@icore/shared',
        dependencies: { tslib: '^2.8.1' },
      }),
    );

    // 6. libs/template-shared/package.json (bare)
    await mkdir(join(dir, 'libs/template-shared'), { recursive: true });
    await writeFile(
      join(dir, 'libs/template-shared/package.json'),
      JSON.stringify({
        name: '@icore/template-shared',
        dependencies: { zustand: '^5.0.15' },
      }),
    );

    // 7. libs/jobs-client/package.json (bare)
    await mkdir(join(dir, 'libs/jobs-client'), { recursive: true });
    await writeFile(
      join(dir, 'libs/jobs-client/package.json'),
      JSON.stringify({
        name: '@icore/jobs-client',
        dependencies: { '@icore/shared': '*' },
      }),
    );

    // Run the codemod
    await migrate(dir);

    // Verify root
    const rootPkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    expect(rootPkg.devDependencies['webpack']).toBe('5.111.1');
    expect(rootPkg.devDependencies['nx']).toBe('23.2.1');

    // Verify apps/api
    const apiPkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8'));
    expect(apiPkg.devDependencies['@nx/webpack']).toBe('23.2.1');
    expect(apiPkg.devDependencies['@nx/vite']).toBe('23.2.1');
    expect(apiPkg.devDependencies['tsconfig-paths-webpack-plugin']).toBe('^4.2.0');
    expect(apiPkg.devDependencies['vitest']).toBe('~5.0.3');
    expect(apiPkg.devDependencies['vite']).toBe('^8.3.2');
    expect(apiPkg.devDependencies['webpack']).toBe('5.111.1');
    expect(apiPkg.dependencies['@bull-board/ui']).toBe('^9.10.2');
    expect(apiPkg.dependencies['bullmq']).toBe('^6.3.11');
    expect(apiPkg.dependencies['reflect-metadata']).toBe('^0.2.2');
    expect(apiPkg.dependencies['rxjs']).toBe('^7.8.2');
    expect(apiPkg.dependencies['@nestjs/common']).toBe('^11.2.7');

    // Verify apps/client
    const clientPkg = JSON.parse(await readFile(join(dir, 'apps/client/package.json'), 'utf8'));
    expect(clientPkg.devDependencies['vite']).toBe('^8.3.2');
    expect(clientPkg.devDependencies['@vitejs/plugin-react']).toBe('^6.1.1');
    expect(clientPkg.devDependencies['@tanstack/router-plugin']).toBe('^1.168.42');
    expect(clientPkg.devDependencies['@nx/vite']).toBe('23.2.1');
    expect(clientPkg.devDependencies['vitest']).toBe('~5.0.3');
    expect(clientPkg.dependencies['react']).toBe('^19.3.0');
    expect(clientPkg.dependencies['react-dom']).toBe('^19.3.0');
    expect(clientPkg.dependencies['@tanstack/react-router']).toBe('^1.170.41');
    expect(clientPkg.dependencies['@tanstack/react-query']).toBe('^5.104.1');
    expect(clientPkg.dependencies['clsx']).toBe('^2.1.1');

    // Verify apps/microservices/jobs
    const jobsPkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/jobs/package.json'), 'utf8'),
    );
    expect(jobsPkg.devDependencies['@nx/webpack']).toBe('23.2.1');
    expect(jobsPkg.devDependencies['@nx/vite']).toBe('23.2.1');
    expect(jobsPkg.devDependencies['tsconfig-paths-webpack-plugin']).toBe('^4.2.0');
    expect(jobsPkg.devDependencies['vitest']).toBe('~5.0.3');
    expect(jobsPkg.devDependencies['vite']).toBe('^8.3.2');
    expect(jobsPkg.devDependencies['webpack']).toBe('5.111.1');
    expect(jobsPkg.private).toBe(true);
    expect(jobsPkg.dependencies['bullmq']).toBe('^6.3.11');

    // Verify libs/shared
    const sharedPkg = JSON.parse(await readFile(join(dir, 'libs/shared/package.json'), 'utf8'));
    expect(sharedPkg.devDependencies['@nx/vite']).toBe('23.2.1');
    expect(sharedPkg.devDependencies['vitest']).toBe('~5.0.3');
    expect(sharedPkg.devDependencies['vite']).toBe('^8.3.2');

    // Verify libs/template-shared
    const tmplPkg = JSON.parse(
      await readFile(join(dir, 'libs/template-shared/package.json'), 'utf8'),
    );
    expect(tmplPkg.devDependencies['@nx/vite']).toBe('23.2.1');
    expect(tmplPkg.devDependencies['vitest']).toBe('~5.0.3');
    expect(tmplPkg.peerDependencies['@tanstack/react-router']).toBe('^1.170.41');
    expect(tmplPkg.peerDependencies['react']).toBe('^19.3.0');
    expect(tmplPkg.peerDependencies['react-dom']).toBe('^19.3.0');

    // Verify libs/jobs-client
    const jobsClientPkg = JSON.parse(
      await readFile(join(dir, 'libs/jobs-client/package.json'), 'utf8'),
    );
    expect(jobsClientPkg.dependencies['reflect-metadata']).toBe('^0.2.2');
    expect(jobsClientPkg.dependencies['rxjs']).toBe('^7.8.2');
    expect(jobsClientPkg.devDependencies['jest']).toBe('~30.5.2');
    expect(jobsClientPkg.devDependencies['ts-jest']).toBe('^29.4.14');

    const yarnrc = await readFile(join(dir, '.yarnrc.yml'), 'utf8');
    expect(yarnrc).toContain('nodeLinker: node-modules');
  });

  it('is a no-op and does not fail on missing or partial workspaces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pnp-migration-empty-'));
    await expect(migrate(dir)).resolves.not.toThrow();
  });
});
