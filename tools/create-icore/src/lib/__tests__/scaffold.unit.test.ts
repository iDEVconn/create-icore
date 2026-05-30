import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeAuthEnv,
  writeGatewayEnv,
  writeUploadEnv,
  writeRootEnv,
  removeUploadStack,
  removeNotesStack,
  removeUnusedAuthStrategies,
  removeUnusedStorageStrategies,
  removeUnusedDbStrategies,
} from '../scaffold.js';
import type { CreateIcoreOptions } from '../options.js';

const baseOpts: CreateIcoreOptions = {
  projectName: 'my-app',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'cloudinary',
  payment: 'none',
  jobs: 'none',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'yarn',
  initGit: false,
  install: false,
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'icore-test-'));
  await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
  await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
  await mkdir(join(dir, 'apps/api'), { recursive: true });
  await writeFile(
    join(dir, 'apps/microservices/auth/.env.example'),
    [
      'AUTH_TRANSPORT=tcp',
      'AUTH_HOST=127.0.0.1',
      'AUTH_PORT=4001',
      '# AUTH_REDIS_URL=redis://localhost:6379',
      'AUTH_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/microservices/upload/.env.example'),
    [
      'UPLOAD_TRANSPORT=tcp',
      'UPLOAD_HOST=127.0.0.1',
      'UPLOAD_PORT=4002',
      '# UPLOAD_REDIS_URL=redis://localhost:6379',
      'STORAGE_PROVIDER=supabase',
    ].join('\n'),
  );
  await writeFile(
    join(dir, 'apps/api/.env.example'),
    ['AUTH_TRANSPORT=tcp', '# AUTH_REDIS_URL=redis://localhost:6379', 'UPLOAD_TRANSPORT=tcp'].join(
      '\n',
    ),
  );
});

describe('writeAuthEnv', () => {
  it('replaces AUTH_PROVIDER with the chosen value', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, authProvider: 'firebase' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_PROVIDER=firebase');
    expect(env).not.toContain('AUTH_PROVIDER=supabase');
  });

  it('keeps AUTH_TRANSPORT=tcp by default', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=tcp');
  });

  it('uncomments AUTH_REDIS_URL when transport=redis', async () => {
    await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, transport: 'redis' });
    const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
    expect(env).toContain('AUTH_REDIS_URL=redis://localhost:6379');
    expect(env).not.toContain('# AUTH_REDIS_URL=');
  });
});

describe('writeUploadEnv', () => {
  it('replaces STORAGE_PROVIDER', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'cloudinary' });
    const env = await readFile(join(dir, 'apps/microservices/upload/.env'), 'utf8');
    expect(env).toContain('STORAGE_PROVIDER=cloudinary');
  });

  it('is a no-op when upload === "none"', async () => {
    await writeUploadEnv(dir, { ...baseOpts, targetDir: dir, upload: 'none' });
    // The .env file should NOT have been created
    await expect(access(join(dir, 'apps/microservices/upload/.env'))).rejects.toThrow();
  });
});

describe('writeGatewayEnv', () => {
  it('replaces both transports', async () => {
    await writeGatewayEnv(dir, { ...baseOpts, targetDir: dir, transport: 'nats' });
    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).toContain('AUTH_TRANSPORT=nats');
    expect(env).toContain('UPLOAD_TRANSPORT=nats');
  });
});

describe('writeRootEnv', () => {
  it('writes DB_PROVIDER=<chosen> to .env when dbProvider=firebase', async () => {
    await writeRootEnv(dir, { ...baseOpts, targetDir: dir, dbProvider: 'firebase' });
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('DB_PROVIDER=firebase');
  });

  it('writes DB_PROVIDER=supabase to .env when dbProvider=supabase', async () => {
    await writeRootEnv(dir, { ...baseOpts, targetDir: dir, dbProvider: 'supabase' });
    const env = await readFile(join(dir, '.env'), 'utf8');
    expect(env).toContain('DB_PROVIDER=supabase');
  });
});

describe('removeNotesStack', () => {
  it('deletes ms, lib, gateway module and strips imports + deps + tsconfig path + nav + i18n', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-notes-'));

    // notes MS stub
    await mkdir(join(dir, 'apps/microservices/notes/src'), { recursive: true });
    await writeFile(join(dir, 'apps/microservices/notes/src/main.ts'), 'export {};');

    // notes-client lib stub
    await mkdir(join(dir, 'libs/notes-client/src'), { recursive: true });
    await writeFile(join(dir, 'libs/notes-client/src/index.ts'), 'export {};');

    // gateway notes module stub
    await mkdir(join(dir, 'apps/api/src/app/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/notes/notes.module.ts'),
      'export class NotesModule {}',
    );

    // app.module.ts with NotesModule
    await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/app.module.ts'),
      `import { AuthModule } from './auth/auth.module';\nimport { NotesModule } from './notes/notes.module';\n@Module({ imports: [AuthModule, NotesModule] })\nexport class AppModule {}`,
    );

    // api package.json with notes-client dep
    await mkdir(join(dir, 'apps/api'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/package.json'),
      JSON.stringify(
        { name: 'api', dependencies: { '@icore/notes-client': '*', '@icore/auth-client': '*' } },
        null,
        2,
      ),
    );

    // tsconfig.base.json with notes-client path
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{\n  "compilerOptions": {\n    "paths": {\n      "@icore/auth-client": ["./libs/auth-client/src/index.ts"],\n      "@icore/notes-client": ["./libs/notes-client/src/index.ts"]\n    }\n  }\n}`,
    );

    // client route + query stub
    await mkdir(join(dir, 'apps/client/src/routes/_dashboard'), { recursive: true });
    await writeFile(
      join(dir, 'apps/client/src/routes/_dashboard/notes.tsx'),
      'export const Route = {};',
    );
    await mkdir(join(dir, 'apps/client/src/queries'), { recursive: true });
    await writeFile(join(dir, 'apps/client/src/queries/notes.ts'), 'export {};');

    // notes components stub (shadcn only)
    await mkdir(join(dir, 'apps/client/src/components/notes'), { recursive: true });
    await writeFile(join(dir, 'apps/client/src/components/notes/NotesTable.tsx'), 'export {};');

    // LayoutSider with shadcn pattern
    await mkdir(join(dir, 'apps/client/src/components/layout'), { recursive: true });
    await writeFile(
      join(dir, 'apps/client/src/components/layout/LayoutSider.tsx'),
      `import { LayoutDashboard, StickyNote, User } from 'lucide-react';\n` +
        `export function LayoutSider() {\n  return (\n    <nav>\n` +
        `      <Link to="/_dashboard/notes"><StickyNote size={16} />{t('notes.title')}</Link>\n` +
        `    </nav>\n  );\n}`,
    );

    // i18n keys.ts with notes block
    await mkdir(join(dir, 'libs/template-shared/src/lib/i18n'), { recursive: true });
    await writeFile(
      join(dir, 'libs/template-shared/src/lib/i18n/keys.ts'),
      `export const ICORE_LOCALES = {\n  en: {\n    nav: { dashboard: 'Dashboard' },\n    notes: {\n      title: 'Notes',\n      new: 'New note',\n    },\n    error: { unknown: 'Error' },\n  },\n} as const;`,
    );

    await removeNotesStack(dir);

    // Backend removed
    await expect(access(join(dir, 'apps/microservices/notes'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/notes-client'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/api/src/app/notes'))).rejects.toThrow();

    // Client files removed
    await expect(
      access(join(dir, 'apps/client/src/routes/_dashboard/notes.tsx')),
    ).rejects.toThrow();
    await expect(access(join(dir, 'apps/client/src/queries/notes.ts'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/client/src/components/notes'))).rejects.toThrow();

    // app.module.ts stripped
    const mod = await readFile(join(dir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('NotesModule');
    expect(mod).toContain('AuthModule');

    // api package.json stripped
    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).not.toHaveProperty('@icore/notes-client');
    expect(pkg.dependencies).toHaveProperty('@icore/auth-client');

    // tsconfig path stripped
    const tsconfig = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/notes-client');
    expect(tsconfig).toContain('@icore/auth-client');

    // LayoutSider: StickyNote removed
    const sider = await readFile(
      join(dir, 'apps/client/src/components/layout/LayoutSider.tsx'),
      'utf8',
    );
    expect(sider).not.toContain('StickyNote');
    expect(sider).not.toContain('/_dashboard/notes');

    // i18n: notes block removed
    const keys = await readFile(join(dir, 'libs/template-shared/src/lib/i18n/keys.ts'), 'utf8');
    expect(keys).not.toContain('notes:');
    expect(keys).toContain('nav:');
  });
});

describe('removeUnusedAuthStrategies', () => {
  it('auth=supabase removes firebase lib and strips its import/function/case from auth module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-auth-'));

    await mkdir(join(dir, 'libs/auth-strategies/firebase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/firebase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'libs/auth-strategies/supabase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/supabase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'apps/microservices/auth/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/src/app/app.module.ts'),
      `import * as admin from 'firebase-admin';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nfunction makeSupabaseAuth(cfg: ConfigService): AuthStrategy {\n  return new SupabaseAuthStrategy();\n}\nfunction makeFirebaseAuth(cfg: ConfigService): AuthStrategy {\n  return admin.app() as unknown as AuthStrategy;\n}\n        if (provider === 'supabase') return makeSupabaseAuth(cfg);\n        return makeFirebaseAuth(cfg);`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/auth-supabase":["./libs/auth-strategies/supabase/src/index.ts"],"@icore/auth-firebase":["./libs/auth-strategies/firebase/src/index.ts"]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/package.json'),
      JSON.stringify(
        {
          name: 'auth',
          dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' },
        },
        null,
        2,
      ),
    );

    await removeUnusedAuthStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/auth/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/auth-firebase');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).not.toContain('makeFirebaseAuth');
    expect(mod).toContain('makeSupabaseAuth');
    expect(mod).toContain('SupabaseAuthStrategy');
    const tsconfig = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    expect(tsconfig).not.toContain('@icore/auth-firebase');
    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@icore/auth-firebase');
  });

  it('auth=firebase removes supabase lib and strips its import/case from auth module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-auth-'));

    await mkdir(join(dir, 'libs/auth-strategies/supabase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/supabase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'libs/auth-strategies/firebase/src'), { recursive: true });
    await writeFile(join(dir, 'libs/auth-strategies/firebase/src/index.ts'), 'export {};');
    await mkdir(join(dir, 'apps/microservices/auth/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/src/app/app.module.ts'),
      `import { createClient } from '@supabase/supabase-js';\nimport * as admin from 'firebase-admin';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nfunction makeSupabaseAuth(cfg: ConfigService): AuthStrategy {\n  return new SupabaseAuthStrategy(createClient('', ''));\n}\nfunction makeFirebaseAuth(cfg: ConfigService): AuthStrategy {\n  return new FirebaseAuthStrategy();\n}\n        if (provider === 'supabase') return makeSupabaseAuth(cfg);\n        return makeFirebaseAuth(cfg);`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/auth-supabase":["./libs/auth-strategies/supabase/src/index.ts"],"@icore/auth-firebase":["./libs/auth-strategies/firebase/src/index.ts"]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/auth'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/package.json'),
      JSON.stringify(
        {
          name: 'auth',
          dependencies: { '@icore/auth-supabase': '*', '@icore/auth-firebase': '*' },
        },
        null,
        2,
      ),
    );

    await removeUnusedAuthStrategies(dir, 'firebase');

    await expect(access(join(dir, 'libs/auth-strategies/supabase'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/auth/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/auth-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).not.toContain('makeSupabaseAuth');
    expect(mod).toContain('makeFirebaseAuth');
    expect(mod).toContain('FirebaseAuthStrategy');
  });
});

describe('removeUnusedStorageStrategies', () => {
  it('upload=supabase removes firebase+cloudinary libs and strips from upload module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-storage-'));

    for (const s of ['supabase', 'firebase', 'cloudinary']) {
      await mkdir(join(dir, `libs/storage-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/storage-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/upload/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      `import { createClient } from '@supabase/supabase-js';\nimport * as admin from 'firebase-admin';\nimport { v2 as cloudinary } from 'cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\n\nfunction makeSupabaseStorage(cfg: ConfigService): StorageStrategy {\n  return new SupabaseStorageStrategy({ client: createClient('', '') as never, bucket: 'b' });\n}\n\nfunction makeFirebaseStorage(cfg: ConfigService): StorageStrategy {\n  return new FirebaseStorageStrategy({ bucket: admin.storage().bucket() as never });\n}\n\nfunction makeCloudinaryStorage(cfg: ConfigService): StorageStrategy {\n  void cloudinary;\n  return new CloudinaryStorageStrategy({ api: {} as never, bucket: 'cloudinary' });\n}\n\n        if (provider === 'supabase') return makeSupabaseStorage(cfg);\n        if (provider === 'firebase') return makeFirebaseStorage(cfg);\n        return makeCloudinaryStorage(cfg);`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/storage-supabase":[""],"@icore/storage-firebase":[""],"@icore/storage-cloudinary":[""]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/upload'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/package.json'),
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

    await removeUnusedStorageStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
    const mod = await readFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      'utf8',
    );
    expect(mod).not.toContain('@icore/storage-firebase');
    expect(mod).not.toContain('@icore/storage-cloudinary');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).not.toContain("from 'cloudinary'");
    expect(mod).not.toContain('makeFirebaseStorage');
    expect(mod).not.toContain('makeCloudinaryStorage');
    expect(mod).toContain('SupabaseStorageStrategy');
  });

  it('upload=none is a no-op (upload stack already removed)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-storage-none-'));
    await removeUnusedStorageStrategies(dir, 'none');
    // Should not throw even with no dirs present
  });
});

describe('removeUnusedDbStrategies', () => {
  it('db=supabase removes firestore lib and strips from notes module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-db-'));

    for (const s of ['supabase', 'firestore']) {
      await mkdir(join(dir, `libs/db-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/src/app/app.module.ts'),
      `import { createClient } from '@supabase/supabase-js';\nimport * as admin from 'firebase-admin';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nfunction makeSupabaseDB(cfg: ConfigService): DBStrategy {\n  return new SupabaseDBStrategy({ client: createClient('', '') as never });\n}\nfunction makeFirestoreDB(cfg: ConfigService): DBStrategy {\n  return new FirestoreDBStrategy({ db: admin.firestore() as never });\n}\n        if (provider === 'supabase') return makeSupabaseDB(cfg);\n        return makeFirestoreDB(cfg);`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/db-supabase":[""],"@icore/db-firestore":[""]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/package.json'),
      JSON.stringify(
        { name: 'notes', dependencies: { '@icore/db-supabase': '*', '@icore/db-firestore': '*' } },
        null,
        2,
      ),
    );

    await removeUnusedDbStrategies(dir, 'supabase');

    await expect(access(join(dir, 'libs/db-strategies/firestore'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/notes/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/db-firestore');
    expect(mod).not.toContain('firebase-admin');
    expect(mod).not.toContain('makeFirestoreDB');
    expect(mod).toContain('makeSupabaseDB');
    expect(mod).toContain('SupabaseDBStrategy');
  });

  it('db=firebase removes supabase lib and strips from notes module', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-db-'));

    for (const s of ['supabase', 'firestore']) {
      await mkdir(join(dir, `libs/db-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/src/app/app.module.ts'),
      `import { createClient } from '@supabase/supabase-js';\nimport * as admin from 'firebase-admin';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nfunction makeSupabaseDB(cfg: ConfigService): DBStrategy {\n  return new SupabaseDBStrategy({ client: createClient('', '') as never });\n}\nfunction makeFirestoreDB(cfg: ConfigService): DBStrategy {\n  return new FirestoreDBStrategy({ db: admin.firestore() as never });\n}\n        if (provider === 'supabase') return makeSupabaseDB(cfg);\n        return makeFirestoreDB(cfg);`,
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      `{"compilerOptions":{"paths":{"@icore/db-supabase":[""],"@icore/db-firestore":[""]}}}`,
    );
    await mkdir(join(dir, 'apps/microservices/notes'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/package.json'),
      JSON.stringify(
        { name: 'notes', dependencies: { '@icore/db-supabase': '*', '@icore/db-firestore': '*' } },
        null,
        2,
      ),
    );

    await removeUnusedDbStrategies(dir, 'firebase');

    await expect(access(join(dir, 'libs/db-strategies/supabase'))).rejects.toThrow();
    const mod = await readFile(join(dir, 'apps/microservices/notes/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/db-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).not.toContain('makeSupabaseDB');
    expect(mod).toContain('makeFirestoreDB');
    expect(mod).toContain('FirestoreDBStrategy');
  });
});

describe('removeUploadStack', () => {
  it('removes upload MS, storage strategy libs, upload-client, and gateway storage dir', async () => {
    // Pre-populate the paths that removeUploadStack should delete
    await mkdir(join(dir, 'apps/microservices/upload-e2e'), { recursive: true });
    await writeFile(join(dir, 'apps/microservices/upload-e2e/placeholder.ts'), '');
    await mkdir(join(dir, 'libs/storage-strategies/supabase'), { recursive: true });
    await writeFile(
      join(dir, 'libs/storage-strategies/supabase/package.json'),
      JSON.stringify({ name: 'storage-supabase' }),
    );
    await mkdir(join(dir, 'libs/upload-client'), { recursive: true });
    await writeFile(
      join(dir, 'libs/upload-client/package.json'),
      JSON.stringify({ name: 'upload-client' }),
    );
    await mkdir(join(dir, 'apps/api/src/app/storage'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/storage/storage.module.ts'),
      'export class StorageModule {}',
    );
    await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/api/src/app/app.module.ts'),
      [
        "import { StorageModule } from './storage/storage.module';",
        "import { AuthModule } from './auth/auth.module';",
        '@Module({ imports: [AuthModule, StorageModule] })',
        'export class AppModule {}',
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'apps/api/.env'),
      [
        'AUTH_TRANSPORT=tcp',
        'UPLOAD_TRANSPORT=tcp',
        'UPLOAD_HOST=127.0.0.1',
        'MAX_FILE_SIZE_KB=2048',
      ].join('\n'),
    );

    await removeUploadStack(dir);

    // upload directories are gone
    await expect(access(join(dir, 'apps/microservices/upload'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/microservices/upload-e2e'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/upload-client'))).rejects.toThrow();
    await expect(access(join(dir, 'apps/api/src/app/storage'))).rejects.toThrow();

    // StorageModule stripped from app.module.ts
    const appModule = await readFile(join(dir, 'apps/api/src/app/app.module.ts'), 'utf8');
    expect(appModule).not.toContain('StorageModule');

    // UPLOAD_* and MAX_FILE_SIZE_KB stripped from gateway .env
    const gatewayEnv = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(gatewayEnv).toContain('AUTH_TRANSPORT=tcp');
    expect(gatewayEnv).not.toContain('UPLOAD_TRANSPORT');
    expect(gatewayEnv).not.toContain('UPLOAD_HOST');
    expect(gatewayEnv).not.toContain('MAX_FILE_SIZE_KB');
  });
});
