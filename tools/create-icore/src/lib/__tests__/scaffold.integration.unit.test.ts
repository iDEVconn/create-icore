import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtemp, readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold.js';

async function makeFakeTemplates(): Promise<string> {
  const tplDir = await mkdtemp(join(tmpdir(), 'icore-tpl-'));
  // minimal subset — root + the three apps + a stub libs dir + a stub client-shadcn
  await writeFile(
    join(tplDir, 'package.json'),
    JSON.stringify({ name: 'icore', version: '0.1.0' }, null, 2),
  );
  await mkdir(join(tplDir, 'apps/api'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/.env.example'),
    'AUTH_TRANSPORT=tcp\nUPLOAD_TRANSPORT=tcp\n',
  );
  await mkdir(join(tplDir, 'apps/microservices/auth'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/auth/.env.example'),
    'AUTH_TRANSPORT=tcp\nAUTH_PROVIDER=supabase\n',
  );
  await mkdir(join(tplDir, 'apps/microservices/upload'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/upload/.env.example'),
    'UPLOAD_TRANSPORT=tcp\nSTORAGE_PROVIDER=supabase\n',
  );
  // Add upload-e2e stub
  await mkdir(join(tplDir, 'apps/microservices/upload-e2e'), { recursive: true });
  await writeFile(join(tplDir, 'apps/microservices/upload-e2e/placeholder.ts'), '');
  // Add storage strategy libs stub
  await mkdir(join(tplDir, 'libs/storage-strategies/supabase'), { recursive: true });
  await writeFile(
    join(tplDir, 'libs/storage-strategies/supabase/package.json'),
    JSON.stringify({ name: 'storage-supabase' }),
  );
  // Add upload-client stub
  await mkdir(join(tplDir, 'libs/upload-client'), { recursive: true });
  await writeFile(
    join(tplDir, 'libs/upload-client/package.json'),
    JSON.stringify({ name: 'upload-client' }),
  );
  // Add gateway storage module stub
  await mkdir(join(tplDir, 'apps/api/src/app/storage'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/src/app/storage/storage.module.ts'),
    'export class StorageModule {}',
  );
  await writeFile(
    join(tplDir, 'apps/api/src/app/app.module.ts'),
    [
      "import { StorageModule } from './storage/storage.module';",
      "import { AuthModule } from './auth/auth.module';",
      '@Module({ imports: [AuthModule, StorageModule] })',
      'export class AppModule {}',
    ].join('\n'),
  );
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-shadcn/package.json'), '{}');
  // antd template stub — differentiates from shadcn via a marker file
  await mkdir(join(tplDir, 'apps/templates/client-antd/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-antd/marker.txt'), 'antd');
  // mui template stub — differentiates from shadcn/antd via a marker file
  await mkdir(join(tplDir, 'apps/templates/client-mui/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-mui/marker.txt'), 'mui');
  return tplDir;
}

describe('scaffold (integration, dry-run)', () => {
  let templatesDir: string;

  beforeAll(async () => {
    templatesDir = await makeFakeTemplates();
  });

  it('copies the tree, rewrites env, picks the shadcn template', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'my-app');
    await scaffold(
      {
        projectName: 'my-app',
        targetDir: outputDir,
        authProvider: 'firebase',
        dbProvider: 'supabase',
        upload: 'cloudinary',
        payment: 'none',
        jobs: 'none',
        ui: 'shadcn',
        transport: 'redis',
        initGit: false,
        install: false,
      },
      templatesDir,
    );

    const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('my-app');

    const authEnv = await readFile(join(outputDir, 'apps/microservices/auth/.env'), 'utf8');
    expect(authEnv).toContain('AUTH_PROVIDER=firebase');
    expect(authEnv).toContain('AUTH_TRANSPORT=redis');

    const uploadEnv = await readFile(join(outputDir, 'apps/microservices/upload/.env'), 'utf8');
    expect(uploadEnv).toContain('STORAGE_PROVIDER=cloudinary');

    const rootEnv = await readFile(join(outputDir, '.env'), 'utf8');
    expect(rootEnv).toContain('DB_PROVIDER=supabase');

    // apps/templates should be gone, apps/client should exist
    const apps = await readdir(join(outputDir, 'apps'));
    expect(apps).toContain('client');
    expect(apps).not.toContain('templates');
  });

  it('removes upload stack when upload=none', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'no-upload-app');
    await scaffold(
      {
        projectName: 'no-upload-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'none',
        payment: 'none',
        jobs: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        install: false,
      },
      templatesDir,
    );

    // upload microservice should be gone
    await expect(access(join(outputDir, 'apps/microservices/upload'))).rejects.toThrow();
    // storage strategy libs should be gone
    await expect(access(join(outputDir, 'libs/storage-strategies'))).rejects.toThrow();
    // upload-client should be gone
    await expect(access(join(outputDir, 'libs/upload-client'))).rejects.toThrow();

    // No upload .env was written
    await expect(access(join(outputDir, 'apps/microservices/upload/.env'))).rejects.toThrow();

    // The rest of the scaffold should still be intact
    const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('no-upload-app');

    const authEnv = await readFile(join(outputDir, 'apps/microservices/auth/.env'), 'utf8');
    expect(authEnv).toContain('AUTH_PROVIDER=supabase');
  });

  it('selects client-antd when opts.ui === "antd"', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'antd-app');
    await scaffold(
      {
        projectName: 'antd-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        ui: 'antd',
        transport: 'tcp',
        initGit: false,
        install: false,
      },
      templatesDir,
    );

    // apps/templates should be gone, apps/client should exist with antd contents
    const apps = await readdir(join(outputDir, 'apps'));
    expect(apps).toContain('client');
    expect(apps).not.toContain('templates');

    // marker.txt proves the antd template was copied (not shadcn)
    const marker = await readFile(join(outputDir, 'apps/client/marker.txt'), 'utf8');
    expect(marker).toBe('antd');
  });

  it('selects client-mui when opts.ui === "mui"', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'mui-app');
    await scaffold(
      {
        projectName: 'mui-app',
        targetDir: outputDir,
        authProvider: 'firebase',
        dbProvider: 'firebase',
        upload: 'cloudinary',
        payment: 'none',
        jobs: 'none',
        ui: 'mui',
        transport: 'tcp',
        initGit: false,
        install: false,
      },
      templatesDir,
    );

    // apps/templates should be gone, apps/client should exist with mui contents
    const apps = await readdir(join(outputDir, 'apps'));
    expect(apps).toContain('client');
    expect(apps).not.toContain('templates');

    // marker.txt proves the mui template was copied (not shadcn or antd)
    const marker = await readFile(join(outputDir, 'apps/client/marker.txt'), 'utf8');
    expect(marker).toBe('mui');
  });
});
