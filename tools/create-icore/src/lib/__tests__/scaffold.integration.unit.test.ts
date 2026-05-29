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
  await mkdir(join(tplDir, 'apps/templates/client-shadcn/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-shadcn/package.json'), '{}');
  // antd template stub — differentiates from shadcn via a marker file
  await mkdir(join(tplDir, 'apps/templates/client-antd/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-antd/marker.txt'), 'antd');
  // mui template stub — differentiates from shadcn/antd via a marker file
  await mkdir(join(tplDir, 'apps/templates/client-mui/src'), { recursive: true });
  await writeFile(join(tplDir, 'apps/templates/client-mui/marker.txt'), 'mui');

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
  await writeFile(
    join(tplDir, 'apps/api/src/app/app.module.ts'),
    [
      "import { NotesModule } from './notes/notes.module';",
      "import { StorageModule } from './storage/storage.module';",
      "import { AuthModule } from './auth/auth.module';",
      '@Module({ imports: [AuthModule, StorageModule, NotesModule] })',
      'export class AppModule {}',
    ].join('\n'),
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

  // tsconfig.base.json with all strategy paths
  await writeFile(
    join(tplDir, 'tsconfig.base.json'),
    JSON.stringify(
      {
        compilerOptions: {
          paths: {
            '@icore/auth-supabase': ['./libs/auth-strategies/supabase/src/index.ts'],
            '@icore/auth-firebase': ['./libs/auth-strategies/firebase/src/index.ts'],
            '@icore/storage-supabase': ['./libs/storage-strategies/supabase/src/index.ts'],
            '@icore/storage-firebase': ['./libs/storage-strategies/firebase/src/index.ts'],
            '@icore/storage-cloudinary': ['./libs/storage-strategies/cloudinary/src/index.ts'],
            '@icore/db-supabase': ['./libs/db-strategies/supabase/src/index.ts'],
            '@icore/db-firestore': ['./libs/db-strategies/firestore/src/index.ts'],
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
      { name: 'auth', dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' } },
      null,
      2,
    ),
  );
  await mkdir(join(tplDir, 'apps/microservices/auth/src/app'), { recursive: true });
  await writeFile(
    join(tplDir, 'apps/microservices/auth/src/app/app.module.ts'),
    `import * as admin from 'firebase-admin';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\n`,
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
    `import * as admin from 'firebase-admin';\nimport { v2 as cloudinary } from 'cloudinary';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nfunction makeFirebaseStorage() {}\nfunction makeCloudinaryStorage() {}\n`,
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
    `import * as admin from 'firebase-admin';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\n`,
  );

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

    // app.module.ts has no NotesModule
    const mod = await readFile(join(outputDir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('NotesModule');

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
        install: false,
      },
      templatesDir,
    );

    // Unused libs removed
    await expect(access(join(outputDir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
    await expect(access(join(outputDir, 'libs/db-strategies/firestore'))).rejects.toThrow();

    // Selected libs kept
    const authLibExists = await access(join(outputDir, 'libs/auth-strategies/supabase'))
      .then(() => true)
      .catch(() => false);
    expect(authLibExists).toBe(true);

    // Auth module no longer imports firebase
    const authMod = await readFile(
      join(outputDir, 'apps/microservices/auth/src/app/app.module.ts'),
      'utf8',
    );
    expect(authMod).not.toContain('@icore/auth-firebase');
    expect(authMod).not.toContain('firebase-admin');

    // tsconfig has no firebase/cloudinary paths
    const tsconfig = await readFile(join(outputDir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/auth-firebase');
    expect(tsconfig).not.toContain('@icore/storage-firebase');
    expect(tsconfig).not.toContain('@icore/storage-cloudinary');
  });
});
