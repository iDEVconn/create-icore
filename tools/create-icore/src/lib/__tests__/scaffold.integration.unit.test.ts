import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtemp, readFile, readdir, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffold } from '../scaffold.js';

async function findPackageJsonFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findPackageJsonFiles(full)));
    } else if (entry.name === 'package.json') {
      results.push(full);
    }
  }
  return results;
}

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
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/templates/client-shadcn/package.json'),
    JSON.stringify(
      {
        name: 'client-shadcn',
        version: '0.0.1',
        private: true,
        dependencies: { tailwindcss: '^4', 'lucide-react': '^1' },
      },
      null,
      2,
    ),
  );
  // antd template stub
  await mkdir(join(tplDir, 'apps/templates/client-antd/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-antd/marker.txt'), 'antd');
  await writeFile(
    join(tplDir, 'apps/templates/client-antd/package.json'),
    JSON.stringify(
      { name: 'client-antd', version: '0.0.1', private: true, dependencies: { antd: '^6' } },
      null,
      2,
    ),
  );
  // mui template stub
  await mkdir(join(tplDir, 'apps/templates/client-mui/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-mui/marker.txt'), 'mui');
  await writeFile(
    join(tplDir, 'apps/templates/client-mui/package.json'),
    JSON.stringify(
      {
        name: 'client-mui',
        version: '0.0.1',
        private: true,
        dependencies: { '@mui/material': '^6', '@emotion/react': '^11' },
      },
      null,
      2,
    ),
  );

  // notes MS stub
  await mkdir(join(tplDir, 'apps/microservices/notes/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/microservices/notes/src/main.ts'), 'export {};');

  // notes-client lib stub
  await mkdir(join(tplDir, 'libs/notes-client/src'), { recursive: true });
  await writeFile(join(tplDir, 'libs/notes-client/src/index.ts'), 'export {};');

  // gateway notes module stub + update app.module.ts to include NotesModule
  await mkdir(join(tplDir, 'apps/api/src/app/notes'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/src/app/notes/notes.module.ts'),
    'export class NotesModule {}',
  );
  // Static app.module — never touched by the generator. Feature wiring lives in
  // the generated features.module.ts (written by writeFeaturesWiring).
  await writeFile(
    join(tplDir, 'apps/api/src/app/app.module.ts'),
    [
      "import { StorageModule } from './storage/storage.module';",
      "import { AuthModule } from './auth/auth.module';",
      "import { FeaturesModule } from './features.module';",
      '@Module({ imports: [AuthModule, StorageModule, FeaturesModule] })',
      'export class AppModule {}',
    ].join('\n'),
  );
  // Template ships a features.module.ts with all 3 (generator overwrites it).
  await writeFile(
    join(tplDir, 'apps/api/src/app/features.module.ts'),
    [
      "import { Module } from '@nestjs/common';",
      "import { NotesModule } from './notes/notes.module';",
      "import { PaymentModule } from './payment/payment.module';",
      "import { AdminModule } from './admin/admin.module';",
      '@Module({ imports: [NotesModule, PaymentModule, AdminModule] })',
      'export class FeaturesModule {}',
    ].join('\n'),
  );

  await writeFile(
    join(tplDir, 'apps/api/package.json'),
    JSON.stringify(
      {
        name: 'api',
        dependencies: {
          '@icore/auth-client': '*',
          '@icore/jobs-client': '*',
          '@bull-board/api': '^7',
          '@bull-board/express': '^7',
          '@icore/payment-client': '*',
          '@idevconn/payment': '^1.2.0',
        },
      },
      null,
      2,
    ),
  );

  // client-antd package.json — antd-specific deps
  await writeFile(
    join(tplDir, 'apps/templates/client-antd/package.json'),
    JSON.stringify(
      {
        name: 'client-antd',
        version: '0.0.1',
        private: true,
        dependencies: { antd: '^6', '@ant-design/icons': '^6' },
      },
      null,
      2,
    ),
  );

  // client-mui package.json — mui-specific deps
  await mkdir(join(tplDir, 'apps/templates/client-mui'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/templates/client-mui/package.json'),
    JSON.stringify(
      {
        name: 'client-mui',
        version: '0.0.1',
        private: true,
        dependencies: { '@mui/material': '^6', '@emotion/react': '^11' },
      },
      null,
      2,
    ),
  );

  // jobs MS stub + package.json
  await mkdir(join(tplDir, 'apps/microservices/jobs/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/microservices/jobs/src/main.ts'), 'export {};');
  await writeFile(
    join(tplDir, 'apps/microservices/jobs/package.json'),
    JSON.stringify(
      {
        name: 'jobs',
        version: '0.0.1',
        private: true,
        dependencies: { bullmq: '^5', ioredis: '^5' },
      },
      null,
      2,
    ),
  );

  // jobs-client lib stub + package.json (cleanupUnusedFeatures deletes this dir)
  await mkdir(join(tplDir, 'libs/jobs-client/src'), { recursive: true });
  await writeFile(join(tplDir, 'libs/jobs-client/src/index.ts'), 'export {};');
  await writeFile(
    join(tplDir, 'libs/jobs-client/package.json'),
    JSON.stringify(
      {
        name: '@icore/jobs-client',
        version: '0.0.1',
        private: true,
        dependencies: { bullmq: '^5', ioredis: '^5' },
      },
      null,
      2,
    ),
  );

  // admin dir stub (cleanupUnusedFeatures deletes apps/api/src/app/admin)
  await mkdir(join(tplDir, 'apps/api/src/app/admin'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/src/app/admin/admin.module.ts'),
    "import { AdminModule } from './admin.module';\nexport class AdminModule {}",
  );

  // payment MS stub + package.json
  await mkdir(join(tplDir, 'apps/microservices/payment/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/microservices/payment/src/main.ts'), 'export {};');
  await writeFile(
    join(tplDir, 'apps/microservices/payment/package.json'),
    JSON.stringify(
      {
        name: 'payment',
        version: '0.0.1',
        private: true,
        dependencies: { '@idevconn/payment': '^1.2.0' },
      },
      null,
      2,
    ),
  );

  // payment-client lib stub + package.json (cleanupUnusedFeatures deletes this)
  await mkdir(join(tplDir, 'libs/payment-client/src'), { recursive: true });
  await writeFile(join(tplDir, 'libs/payment-client/src/index.ts'), 'export {};');
  await writeFile(
    join(tplDir, 'libs/payment-client/package.json'),
    JSON.stringify(
      {
        name: '@icore/payment-client',
        version: '0.0.1',
        private: true,
        dependencies: { '@idevconn/payment': '^1.2.0' },
      },
      null,
      2,
    ),
  );

  // payment gateway module stub (cleanupUnusedFeatures deletes apps/api/src/app/payment)
  await mkdir(join(tplDir, 'apps/api/src/app/payment'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/api/src/app/payment/payment.module.ts'),
    'export class PaymentModule {}',
  );
  await writeFile(
    join(tplDir, 'apps/api/src/app/payment/payment.controller.ts'),
    "import type { PaymentClientService } from '@icore/payment-client';",
  );

  // shadcn template: notes route + query stubs
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard'), {
    recursive: true,
  });
  await writeFile(
    join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard/notes.tsx'),
    'export const Route = {};',
  );
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src/queries'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-shadcn/src/queries/notes.ts'), 'export {};');

  // Auth strategy stubs
  for (const s of ['supabase', 'firebase']) {
    await mkdir(join(tplDir, `libs/auth-strategies/${s}/src`), { recursive: true });
    await writeFile(join(tplDir, `libs/auth-strategies/${s}/src/index.ts`), 'export {};');
  }

  // Storage strategy stubs
  for (const s of ['supabase', 'firebase', 'cloudinary']) {
    await mkdir(join(tplDir, `libs/storage-strategies/${s}/src`), { recursive: true });
    await writeFile(join(tplDir, `libs/storage-strategies/${s}/src/index.ts`), 'export {};');
  }

  // DB strategy stubs
  for (const s of ['supabase', 'firestore']) {
    await mkdir(join(tplDir, `libs/db-strategies/${s}/src`), { recursive: true });
    await writeFile(join(tplDir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
  }

  // Shared firebase-admin init lib stub
  await mkdir(join(tplDir, 'libs/firebase-admin/src'), { recursive: true });
  await writeFile(join(tplDir, 'libs/firebase-admin/src/index.ts'), 'export {};');

  // tsconfig.base.json with all strategy paths
  await writeFile(
    join(tplDir, 'tsconfig.base.json'),
    JSON.stringify(
      {
        compilerOptions: {
          paths: {
            '@icore/auth-client': ['./libs/auth-client/src/index.ts'],
            '@icore/auth-supabase': ['./libs/auth-strategies/supabase/src/index.ts'],
            '@icore/auth-firebase': ['./libs/auth-strategies/firebase/src/index.ts'],
            '@icore/storage-supabase': ['./libs/storage-strategies/supabase/src/index.ts'],
            '@icore/storage-firebase': ['./libs/storage-strategies/firebase/src/index.ts'],
            '@icore/storage-cloudinary': ['./libs/storage-strategies/cloudinary/src/index.ts'],
            '@icore/db-supabase': ['./libs/db-strategies/supabase/src/index.ts'],
            '@icore/db-firestore': ['./libs/db-strategies/firestore/src/index.ts'],
            '@icore/firebase-admin': ['./libs/firebase-admin/src/index.ts'],
          },
        },
      },
      null,
      2,
    ),
  );

  // Auth MS package.json
  await mkdir(join(tplDir, 'apps/microservices/auth'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/auth/package.json'),
    JSON.stringify(
      {
        name: 'auth',
        dependencies: {
          '@icore/auth-supabase': '*',
          '@icore/auth-firebase': '*',
          '@icore/auth-mongodb': '*',
          '@icore/firebase-admin': '*',
        },
      },
      null,
      2,
    ),
  );
  await mkdir(join(tplDir, 'apps/microservices/auth/src/app'), { recursive: true });
  // Static app.module (never touched by the generator) + committed auth.provider
  // default (supabase). The generator overwrites auth.provider.ts per chosen
  // provider via writeAuthProvider — app.module.ts stays static.
  await writeFile(
    join(tplDir, 'apps/microservices/auth/src/app/app.module.ts'),
    `import { AuthProviderModule } from './auth.provider';\nexport class AppModule {}\n`,
  );
  await writeFile(
    join(tplDir, 'apps/microservices/auth/src/app/auth.provider.ts'),
    `import { SupabaseAuthModule } from '@icore/auth-supabase';\nexport const AuthProviderModule = SupabaseAuthModule.forRoot('apps/microservices/auth/.env');\n`,
  );

  // Upload MS package.json
  await mkdir(join(tplDir, 'apps/microservices/upload'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/upload/package.json'),
    JSON.stringify(
      {
        name: 'upload',
        dependencies: {
          '@icore/storage-supabase': '*',
          '@icore/storage-firebase': '*',
          '@icore/storage-cloudinary': '*',
        },
      },
      null,
      2,
    ),
  );
  await mkdir(join(tplDir, 'apps/microservices/upload/src/app'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/upload/src/app/app.module.ts'),
    `import { v2 as cloudinary } from 'cloudinary';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nimport { getFirebaseAdmin } from '@icore/firebase-admin';\nfunction makeFirebaseStorage() {}\nfunction makeCloudinaryStorage() {}\n`,
  );

  // Notes MS package.json
  await mkdir(join(tplDir, 'apps/microservices/notes'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/notes/package.json'),
    JSON.stringify(
      { name: 'notes', dependencies: { '@icore/db-supabase': '*', '@icore/db-firestore': '*' } },
      null,
      2,
    ),
  );
  await mkdir(join(tplDir, 'apps/microservices/notes/src/app'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/notes/src/app/app.module.ts'),
    `import { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nimport { getFirebaseAdmin } from '@icore/firebase-admin';\n`,
  );

  // _dashboard.tsx with auth guard (stripped by removeAuthStack when auth=none)
  await writeFile(
    join(tplDir, 'apps/templates/client-shadcn/src/routes/_dashboard.tsx'),
    [
      "import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';",
      "import { useAuthStore } from '@icore/template-shared';",
      "import { MainLayout } from '../layouts/MainLayout';",
      '',
      "export const Route = createFileRoute('/_dashboard')({",
      '  beforeLoad: () => {',
      '    if (!useAuthStore.getState().accessToken) {',
      "      throw redirect({ to: '/login' });",
      '    }',
      '  },',
      '  component: () => (',
      '    <MainLayout>',
      '      <Outlet />',
      '    </MainLayout>',
      '  ),',
      '});',
    ].join('\n'),
  );
  // auth MS gateway dirs (removeAuthStack deletes these from the output)
  await mkdir(join(tplDir, 'apps/api/src/app/auth'), { recursive: true });
  await writeFile(join(tplDir, 'apps/api/src/app/auth/auth.module.ts'), '');
  await mkdir(join(tplDir, 'apps/api/src/app/profile'), { recursive: true });
  await writeFile(join(tplDir, 'apps/api/src/app/profile/profile.controller.ts'), '');
  await mkdir(join(tplDir, 'apps/api/src/app/abilities'), { recursive: true });
  await writeFile(join(tplDir, 'apps/api/src/app/abilities/ability.guard.ts'), '');
  await writeFile(join(tplDir, 'Dockerfile.ms-auth'), '');
  // auth-client lib stub
  await mkdir(join(tplDir, 'libs/auth-client/src'), { recursive: true });
  await writeFile(join(tplDir, 'libs/auth-client/src/index.ts'), 'export {};');

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
        example: 'notes',
        ui: 'shadcn',
        transport: 'redis',
        initGit: false,
        packageManager: 'yarn',
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
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
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
        example: 'notes',
        ui: 'antd',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
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
        example: 'notes',
        ui: 'mui',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
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

  it('removes notes stack when example=none', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'no-notes-app');
    await scaffold(
      {
        projectName: 'no-notes-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
        install: false,
      },
      templatesDir,
    );

    // notes MS and lib gone
    await expect(access(join(outputDir, 'apps/microservices/notes'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/notes-client'))).rejects.toThrow();

    // client notes route gone (moved from templates/client-shadcn → client by selectClientTemplate)
    await expect(
      access(join(outputDir, 'apps/client/src/routes/_dashboard/notes.tsx')),
    ).rejects.toThrow();

    // app.module.ts is static — it imports FeaturesModule, never a feature module directly
    const mod = await readFile(join(outputDir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(mod).toContain('FeaturesModule');
    expect(mod).not.toContain('NotesModule');
    expect(mod).not.toContain('PaymentModule');
    expect(mod).not.toContain('AdminModule');

    // generated features.module.ts has no feature imports (all features off)
    const features = await readFile(join(outputDir, 'apps/api/src/app/features.module.ts'), 'utf8');
    expect(features).not.toContain('NotesModule');
    expect(features).toMatch(/imports:\s*\[\]/);

    // rest of scaffold intact
    const pkg = JSON.parse(await readFile(join(outputDir, 'package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('no-notes-app');
  });

  it('prunes unused strategies when auth=supabase, upload=supabase, db=supabase', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'supabase-app');
    await scaffold(
      {
        projectName: 'supabase-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
        install: false,
      },
      templatesDir,
    );

    // Unused libs removed
    await expect(access(join(outputDir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/db-strategies/firestore'))).rejects.toThrow();
    // firebase used by no provider → shared firebase-admin lib removed too
    await expect(access(join(outputDir, 'libs/firebase-admin'))).rejects.toThrow();

    // Selected libs kept
    const authLibExists = await access(join(outputDir, 'libs/auth-strategies/supabase'))
      .then(() => true)
      .catch(() => false);
    expect(authLibExists).toBe(true);

    // auth.provider wires the chosen provider only — never firebase
    const authProvider = await readFile(
      join(outputDir, 'apps/microservices/auth/src/app/auth.provider.ts'),
      'utf8',
    );
    expect(authProvider).toContain('@icore/auth-supabase');
    expect(authProvider).not.toContain('@icore/auth-firebase');
    expect(authProvider).not.toContain('@icore/firebase-admin');
    // Auth MS package.json: chosen strategy kept, every unused @icore alias —
    // including the orphaned shared @icore/firebase-admin — stripped.
    const authPkg = JSON.parse(
      await readFile(join(outputDir, 'apps/microservices/auth/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(authPkg.dependencies).toHaveProperty('@icore/auth-supabase');
    expect(authPkg.dependencies).not.toHaveProperty('@icore/firebase-admin');
    expect(authPkg.dependencies).not.toHaveProperty('@icore/auth-firebase');
    expect(authPkg.dependencies).not.toHaveProperty('@icore/auth-mongodb');
    // Static app.module never gets provider source surgery
    const authMod = await readFile(
      join(outputDir, 'apps/microservices/auth/src/app/app.module.ts'),
      'utf8',
    );
    expect(authMod).not.toContain('@icore/auth-firebase');
    expect(authMod).not.toContain('@icore/firebase-admin');

    // tsconfig has no firebase/cloudinary paths
    const tsconfig = await readFile(join(outputDir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/auth-firebase');
    expect(tsconfig).not.toContain('@icore/storage-firebase');
    expect(tsconfig).not.toContain('@icore/storage-cloudinary');
    expect(tsconfig).not.toContain('@icore/firebase-admin');
  });

  it('dep isolation: workspace package.json files for removed features absent from output', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'dep-isolation-app');
    await scaffold(
      {
        projectName: 'dep-isolation-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
        install: false,
      },
      templatesDir,
    );

    // apps/templates is gone — both non-shadcn template package.json files are removed
    await expect(access(join(outputDir, 'apps/templates'))).rejects.toThrow();

    // The chosen shadcn template was moved to apps/client — its package.json must exist
    // (this proves the shadcn deps are retained as a workspace member)
    const clientPkg = JSON.parse(
      await readFile(join(outputDir, 'apps/client/package.json'), 'utf8'),
    ) as { name: string; dependencies?: Record<string, string> };
    expect(clientPkg.name).toBe('client-shadcn');
    // shadcn deps must be present in the workspace package.json
    expect(clientPkg.dependencies).toMatchObject({
      tailwindcss: expect.any(String),
      'lucide-react': expect.any(String),
    });

    // jobs MS removed — bullmq/ioredis no longer owned by any workspace package.json
    await expect(access(join(outputDir, 'apps/microservices/jobs/package.json'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/jobs-client/package.json'))).rejects.toThrow();

    // payment MS removed — @idevconn/payment no longer owned by any workspace package.json
    await expect(
      access(join(outputDir, 'apps/microservices/payment/package.json')),
    ).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/payment-client/package.json'))).rejects.toThrow();

    // Scan all remaining package.json files to confirm no orphaned deps leak through
    const forbidden = [
      'antd',
      '@ant-design/icons',
      '@mui/material',
      '@emotion/react',
      'bullmq',
      'ioredis',
      '@idevconn/payment',
      // Orphaned @icore workspace aliases that must not survive an auth=supabase
      // generation — the libs they point at are deleted, so a stray dep breaks install.
      '@icore/auth-firebase',
      '@icore/auth-mongodb',
      '@icore/firebase-admin',
    ];
    const pkgFiles = await findPackageJsonFiles(outputDir);
    for (const pkgFile of pkgFiles) {
      const raw = JSON.parse(await readFile(pkgFile, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...raw.dependencies, ...raw.devDependencies };
      for (const dep of forbidden) {
        expect(allDeps, `${pkgFile} should not declare ${dep}`).not.toHaveProperty(dep);
      }
    }
  });
});

describe('scaffold with authProvider=none', () => {
  let outDir: string;
  let tplDir: string;

  beforeAll(async () => {
    tplDir = await makeFakeTemplates();
    outDir = await mkdtemp(join(tmpdir(), 'icore-no-auth-'));
    await scaffold(
      {
        projectName: 'no-auth-app',
        targetDir: outDir,
        authProvider: 'none',
        dbProvider: 'none',
        upload: 'none',
        payment: 'none',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'yarn',
        initGit: false,
        install: false,
      },
      tplDir,
    );
  });

  it('removes auth MS directory', async () => {
    await expect(access(join(outDir, 'apps/microservices/auth'))).rejects.toThrow();
  });

  it('removes auth strategy libs', async () => {
    await expect(access(join(outDir, 'libs/auth-strategies'))).rejects.toThrow();
  });

  it('removes auth-client lib', async () => {
    await expect(access(join(outDir, 'libs/auth-client'))).rejects.toThrow();
  });

  it('removes gateway auth/, profile/, abilities/ dirs', async () => {
    await expect(access(join(outDir, 'apps/api/src/app/auth'))).rejects.toThrow();
    await expect(access(join(outDir, 'apps/api/src/app/profile'))).rejects.toThrow();
    await expect(access(join(outDir, 'apps/api/src/app/abilities'))).rejects.toThrow();
  });

  it('client _dashboard.tsx has no beforeLoad', async () => {
    const content = await readFile(join(outDir, 'apps/client/src/routes/_dashboard.tsx'), 'utf8');
    expect(content).not.toContain('beforeLoad');
    expect(content).not.toContain('useAuthStore');
    expect(content).toContain('MainLayout');
    expect(content).toContain('Outlet');
  });

  it('gateway-services.ts has no auth entry', async () => {
    const gs = await readFile(join(outDir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).not.toContain("name: 'auth'");
  });

  it('strips auth modules from app.module.ts', async () => {
    const content = await readFile(join(outDir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(content).not.toContain('AuthModule');
    expect(content).not.toContain('ProfileModule');
    expect(content).not.toContain('AbilitiesModule');
    expect(content).toContain('FeaturesModule');
  });

  it('strips @icore/auth-client from api package.json', async () => {
    const pkg = JSON.parse(await readFile(join(outDir, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.['@icore/auth-client']).toBeUndefined();
  });

  it('strips auth tsconfig aliases', async () => {
    const ts = JSON.parse(await readFile(join(outDir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(ts.compilerOptions.paths['@icore/auth-client']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-supabase']).toBeUndefined();
    expect(ts.compilerOptions.paths['@icore/auth-firebase']).toBeUndefined();
  });
});

describe('scaffold with authProvider=none + payment=paypal', () => {
  let outDir: string;
  let tplDir: string;

  beforeAll(async () => {
    tplDir = await makeFakeTemplates();
    outDir = await mkdtemp(join(tmpdir(), 'icore-no-auth-paypal-'));
    await scaffold(
      {
        projectName: 'no-auth-paypal-app',
        targetDir: outDir,
        authProvider: 'none',
        dbProvider: 'none',
        upload: 'none',
        payment: 'paypal',
        jobs: 'none',
        example: 'none',
        ui: 'shadcn',
        transport: 'tcp',
        packageManager: 'yarn',
        initGit: false,
        install: false,
      },
      tplDir,
    );
  });

  it('keeps ./transport export in libs/shared/src/index.ts (payment-client needs buildTransport)', async () => {
    // removeStrategiesLib must NOT run when payment=paypal — payment-client
    // imports buildTransport from @icore/shared, so transport.ts must stay.
    const idx = await readFile(join(outDir, 'libs/shared/src/index.ts'), 'utf8');
    expect(idx).toContain("'./transport'");
  });

  it('keeps ./strategies export in libs/shared/src/index.ts', async () => {
    const idx = await readFile(join(outDir, 'libs/shared/src/index.ts'), 'utf8');
    expect(idx).toContain("'./strategies'");
  });
});

describe('scaffold — pm-specific file generation', () => {
  let templatesDir: string;

  beforeAll(async () => {
    templatesDir = await makeFakeTemplates();
  });

  it('writes .npmrc with legacy-peer-deps=true for npm', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'my-app');
    await scaffold(
      {
        projectName: 'my-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'npm',
        install: false,
      },
      templatesDir,
    );
    const npmrc = await readFile(join(outputDir, '.npmrc'), 'utf8');
    expect(npmrc).toContain('legacy-peer-deps=true');
  });

  it('does not write .npmrc for yarn', async () => {
    const outputDir = join(await mkdtemp(join(tmpdir(), 'icore-out-')), 'my-app');
    await scaffold(
      {
        projectName: 'my-app',
        targetDir: outputDir,
        authProvider: 'supabase',
        dbProvider: 'supabase',
        upload: 'supabase',
        payment: 'none',
        jobs: 'none',
        example: 'notes',
        ui: 'shadcn',
        transport: 'tcp',
        initGit: false,
        packageManager: 'yarn',
        install: false,
      },
      templatesDir,
    );
    await expect(access(join(outputDir, '.npmrc'))).rejects.toThrow();
  });
});
