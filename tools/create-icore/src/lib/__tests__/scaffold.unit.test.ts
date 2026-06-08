import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  rewriteRootPackageJson,
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
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

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
      `import { SupabaseAuthStrategy } from '@icore/auth-supabase';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nimport { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';\nconst REQUIRED_ENV = {\n  supabase: ['SUPABASE_URL'],\n  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'],\n};\nfunction makeSupabaseAuth(cfg: ConfigService): AuthStrategy {\n  return new SupabaseAuthStrategy();\n}\nfunction makeFirebaseAuth(cfg: ConfigService): AuthStrategy {\n  return getFirebaseAdmin(cfg).auth() as unknown as AuthStrategy;\n}\n        if (provider === 'supabase') return makeSupabaseAuth(cfg);\n        if (provider === 'mongodb') return makeMongoDbAuth(connection, cfg);\n        return makeFirebaseAuth(cfg);`,
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
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).not.toContain('getFirebaseAdmin');
    expect(mod).not.toContain('FIREBASE_ADMIN_REQUIRED_ENV');
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

  it('auth=mongodb removes supabase+firebase libs, keeps mongodb imports + MongooseModule', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-auth-'));

    for (const s of ['supabase', 'firebase', 'mongodb']) {
      await mkdir(join(dir, `libs/auth-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/auth-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/auth/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/auth/src/app/app.module.ts'),
      [
        `import { createClient } from '@supabase/supabase-js';`,
        `import { SupabaseAuthStrategy } from '@icore/auth-supabase';`,
        `import { MongoDbAuthStrategy } from '@icore/auth-mongodb';`,
        `import { FirebaseAuthStrategy, HttpIdentityToolkitClient } from '@icore/auth-firebase';`,
        `import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';`,
        `import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';`,
        `import { Connection } from 'mongoose';`,
        `const REQUIRED_ENV = {`,
        `  supabase: ['SUPABASE_URL'],`,
        `  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'],`,
        `  mongodb: ['MONGODB_URI', 'JWT_SECRET'],`,
        `};`,
        ``,
        `function makeSupabaseAuth(cfg: ConfigService): AuthStrategy {`,
        `  return new SupabaseAuthStrategy({ client: createClient('', '') as never });`,
        `}`,
        ``,
        `function makeFirebaseAuth(cfg: ConfigService): AuthStrategy {`,
        `  void FirebaseAuthStrategy; void HttpIdentityToolkitClient;`,
        `  return getFirebaseAdmin(cfg).auth() as unknown as AuthStrategy;`,
        `}`,
        ``,
        `function makeMongoDbAuth(connection: Connection, cfg: ConfigService): AuthStrategy {`,
        `  return new MongoDbAuthStrategy({ connection, jwtSecret: cfg.get('JWT_SECRET')! });`,
        `}`,
        ``,
        `  MongooseModule.forRootAsync({`,
        `    useFactory: (cfg: ConfigService) => ({ uri: cfg.get('MONGODB_URI') }),`,
        `    inject: [ConfigService],`,
        `  }),`,
        `        if (provider === 'supabase') return makeSupabaseAuth(cfg);`,
        `        if (provider === 'mongodb') return makeMongoDbAuth(connection, cfg);`,
        `        return makeFirebaseAuth(cfg);`,
        `      inject: [ConfigService, getConnectionToken()],`,
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/auth-supabase': ['./libs/auth-strategies/supabase/src/index.ts'],
            '@icore/auth-firebase': ['./libs/auth-strategies/firebase/src/index.ts'],
            '@icore/auth-mongodb': ['./libs/auth-strategies/mongodb/src/index.ts'],
          },
        },
      }),
    );
    await writeFile(
      join(dir, 'apps/microservices/auth/package.json'),
      JSON.stringify({
        name: 'auth',
        dependencies: {
          '@icore/auth-supabase': '*',
          '@icore/auth-firebase': '*',
          '@icore/auth-mongodb': '*',
        },
      }),
    );

    await removeUnusedAuthStrategies(dir, 'mongodb');

    await expect(access(join(dir, 'libs/auth-strategies/supabase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/auth-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/auth-strategies/mongodb'))).resolves.toBeUndefined();

    const mod = await readFile(join(dir, 'apps/microservices/auth/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/auth-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).not.toContain('makeSupabaseAuth');
    expect(mod).not.toContain('@icore/auth-firebase');
    expect(mod).not.toContain('makeFirebaseAuth');
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).toContain('@icore/auth-mongodb');
    expect(mod).toContain('MongooseModule');
    expect(mod).toContain('makeMongoDbAuth');
    expect(mod).toContain('return makeMongoDbAuth(connection, cfg);');

    const tsconfig = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/auth-supabase');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/auth-firebase');
    expect(tsconfig.compilerOptions.paths).toHaveProperty('@icore/auth-mongodb');

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/auth/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@icore/auth-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/auth-firebase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/firebase-admin');
    expect(pkg.dependencies).toHaveProperty('@icore/auth-mongodb');
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
      `import { createClient } from '@supabase/supabase-js';\nimport { SupabaseAuthStrategy } from '@icore/auth-supabase';\nimport { FirebaseAuthStrategy } from '@icore/auth-firebase';\nimport { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';\nconst REQUIRED_ENV = {\n  supabase: ['SUPABASE_URL'],\n  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_WEB_API_KEY'],\n};\nfunction makeSupabaseAuth(cfg: ConfigService): AuthStrategy {\n  return new SupabaseAuthStrategy(createClient('', ''));\n}\nfunction makeFirebaseAuth(cfg: ConfigService): AuthStrategy {\n  void FirebaseAuthStrategy;\n  return getFirebaseAdmin(cfg).auth() as unknown as AuthStrategy;\n}\n        if (provider === 'supabase') return makeSupabaseAuth(cfg);\n        if (provider === 'mongodb') return makeMongoDbAuth(connection, cfg);\n        return makeFirebaseAuth(cfg);`,
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
    // firebase-admin init is retained for the chosen firebase provider
    expect(mod).toContain('@icore/firebase-admin');
    expect(mod).toContain('getFirebaseAdmin');
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
      `import { createClient } from '@supabase/supabase-js';\nimport { v2 as cloudinary } from 'cloudinary';\nimport { SupabaseStorageStrategy } from '@icore/storage-supabase';\nimport { FirebaseStorageStrategy } from '@icore/storage-firebase';\nimport { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';\nimport { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';\nconst REQUIRED_ENV = {\n  supabase: ['SUPABASE_URL'],\n  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_STORAGE_BUCKET'],\n  cloudinary: ['CLOUDINARY_CLOUD_NAME'],\n};\n\nfunction makeSupabaseStorage(cfg: ConfigService): StorageStrategy {\n  return new SupabaseStorageStrategy({ client: createClient('', '') as never, bucket: 'b' });\n}\n\nfunction makeFirebaseStorage(cfg: ConfigService): StorageStrategy {\n  void FirebaseStorageStrategy;\n  return getFirebaseAdmin(cfg).storage().bucket() as never;\n}\n\nfunction makeCloudinaryStorage(cfg: ConfigService): StorageStrategy {\n  void cloudinary;\n  return new CloudinaryStorageStrategy({ api: {} as never, bucket: 'cloudinary' });\n}\n\n        if (provider === 'supabase') return makeSupabaseStorage(cfg);\n        if (provider === 'firebase') return makeFirebaseStorage(cfg);\n        if (provider === 'mongodb') return makeMongoDbStorage(connection);\n        return makeCloudinaryStorage(cfg);`,
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
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).not.toContain('getFirebaseAdmin');
    expect(mod).not.toContain("from 'cloudinary'");
    expect(mod).not.toContain('makeFirebaseStorage');
    expect(mod).not.toContain('makeCloudinaryStorage');
    expect(mod).toContain('SupabaseStorageStrategy');
  });

  it('upload=mongodb removes supabase+firebase+cloudinary, keeps mongodb + MongooseModule', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-storage-'));

    for (const s of ['supabase', 'firebase', 'cloudinary', 'mongodb']) {
      await mkdir(join(dir, `libs/storage-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/storage-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/upload/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      [
        `import { createClient } from '@supabase/supabase-js';`,
        `import { v2 as cloudinary } from 'cloudinary';`,
        `import { SupabaseStorageStrategy } from '@icore/storage-supabase';`,
        `import { MongoDbStorageStrategy } from '@icore/storage-mongodb';`,
        `import { FirebaseStorageStrategy } from '@icore/storage-firebase';`,
        `import { CloudinaryStorageStrategy } from '@icore/storage-cloudinary';`,
        `import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';`,
        `import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';`,
        `import { Connection } from 'mongoose';`,
        `const REQUIRED_ENV = {`,
        `  supabase: ['SUPABASE_URL'],`,
        `  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV, 'FIREBASE_STORAGE_BUCKET'],`,
        `  cloudinary: ['CLOUDINARY_CLOUD_NAME'],`,
        `  mongodb: ['MONGODB_URI'],`,
        `};`,
        `function makeSupabaseStorage(cfg: ConfigService): StorageStrategy {`,
        `  return new SupabaseStorageStrategy({ client: createClient('', '') as never, bucket: 'b' });`,
        `}`,
        `function makeFirebaseStorage(cfg: ConfigService): StorageStrategy {`,
        `  void FirebaseStorageStrategy;`,
        `  return getFirebaseAdmin(cfg).storage().bucket() as never;`,
        `}`,
        `function makeCloudinaryStorage(cfg: ConfigService): StorageStrategy {`,
        `  void cloudinary; void CloudinaryStorageStrategy;`,
        `  return {} as never;`,
        `}`,
        `function makeMongoDbStorage(connection: Connection): StorageStrategy {`,
        `  return new MongoDbStorageStrategy({ connection });`,
        `}`,
        `  MongooseModule.forRootAsync({`,
        `    useFactory: (cfg: ConfigService) => ({ uri: cfg.get('MONGODB_URI') }),`,
        `    inject: [ConfigService],`,
        `  }),`,
        `        if (provider === 'supabase') return makeSupabaseStorage(cfg);`,
        `        if (provider === 'firebase') return makeFirebaseStorage(cfg);`,
        `        if (provider === 'mongodb') return makeMongoDbStorage(connection);`,
        `        return makeCloudinaryStorage(cfg);`,
        `      inject: [ConfigService, getConnectionToken()],`,
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/storage-supabase': [''],
            '@icore/storage-firebase': [''],
            '@icore/storage-cloudinary': [''],
            '@icore/storage-mongodb': [''],
          },
        },
      }),
    );
    await writeFile(
      join(dir, 'apps/microservices/upload/package.json'),
      JSON.stringify({
        name: 'upload',
        dependencies: {
          '@icore/storage-supabase': '*',
          '@icore/storage-firebase': '*',
          '@icore/storage-cloudinary': '*',
          '@icore/storage-mongodb': '*',
        },
      }),
    );

    await removeUnusedStorageStrategies(dir, 'mongodb');

    await expect(access(join(dir, 'libs/storage-strategies/supabase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies/firebase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies/cloudinary'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/storage-strategies/mongodb'))).resolves.toBeUndefined();

    const mod = await readFile(
      join(dir, 'apps/microservices/upload/src/app/app.module.ts'),
      'utf8',
    );
    expect(mod).not.toContain('@icore/storage-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).not.toContain('@icore/storage-firebase');
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).not.toContain("from 'cloudinary'");
    expect(mod).not.toContain('@icore/storage-cloudinary');
    expect(mod).not.toContain('makeSupabaseStorage');
    expect(mod).not.toContain('makeFirebaseStorage');
    expect(mod).not.toContain('makeCloudinaryStorage');
    expect(mod).toContain('@icore/storage-mongodb');
    expect(mod).toContain('MongooseModule');
    expect(mod).toContain('makeMongoDbStorage');
    expect(mod).toContain('return makeMongoDbStorage(connection);');

    const tsconfig = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/storage-supabase');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/storage-firebase');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/storage-cloudinary');
    expect(tsconfig.compilerOptions.paths).toHaveProperty('@icore/storage-mongodb');

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/upload/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-firebase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/storage-cloudinary');
    expect(pkg.dependencies).toHaveProperty('@icore/storage-mongodb');
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
      `import { createClient } from '@supabase/supabase-js';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';\nconst REQUIRED_ENV = {\n  supabase: ['SUPABASE_URL'],\n  firestore: [...FIREBASE_ADMIN_REQUIRED_ENV],\n  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV],\n};\nfunction makeSupabaseDB(cfg: ConfigService): DBStrategy {\n  return new SupabaseDBStrategy({ client: createClient('', '') as never });\n}\nfunction makeFirestoreDB(cfg: ConfigService): DBStrategy {\n  void FirestoreDBStrategy;\n  return getFirebaseAdmin(cfg).firestore() as never;\n}\n        if (provider === 'supabase') return makeSupabaseDB(cfg);\n        if (provider === 'mongodb') return makeMongoDb(connection);\n        return makeFirestoreDB(cfg);`,
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
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).not.toContain('getFirebaseAdmin');
    expect(mod).not.toContain('FIREBASE_ADMIN_REQUIRED_ENV');
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
      `import { createClient } from '@supabase/supabase-js';\nimport { SupabaseDBStrategy } from '@icore/db-supabase';\nimport { FirestoreDBStrategy } from '@icore/db-firestore';\nimport { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';\nconst REQUIRED_ENV = {\n  supabase: ['SUPABASE_URL'],\n  firestore: [...FIREBASE_ADMIN_REQUIRED_ENV],\n  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV],\n};\nfunction makeSupabaseDB(cfg: ConfigService): DBStrategy {\n  return new SupabaseDBStrategy({ client: createClient('', '') as never });\n}\nfunction makeFirestoreDB(cfg: ConfigService): DBStrategy {\n  void FirestoreDBStrategy;\n  return getFirebaseAdmin(cfg).firestore() as never;\n}\n        if (provider === 'supabase') return makeSupabaseDB(cfg);\n        if (provider === 'mongodb') return makeMongoDb(connection);\n        return makeFirestoreDB(cfg);`,
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
    // firebase-admin init retained for the chosen firestore provider
    expect(mod).toContain('@icore/firebase-admin');
    expect(mod).toContain('getFirebaseAdmin');
    expect(mod).toContain('FirestoreDBStrategy');
  });

  it('db=mongodb removes supabase+firestore libs, keeps mongodb + MongooseModule', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'icore-db-'));

    for (const s of ['supabase', 'firestore', 'mongodb']) {
      await mkdir(join(dir, `libs/db-strategies/${s}/src`), { recursive: true });
      await writeFile(join(dir, `libs/db-strategies/${s}/src/index.ts`), 'export {};');
    }
    await mkdir(join(dir, 'apps/microservices/notes/src/app'), { recursive: true });
    await writeFile(
      join(dir, 'apps/microservices/notes/src/app/app.module.ts'),
      [
        `import { createClient } from '@supabase/supabase-js';`,
        `import { SupabaseDBStrategy } from '@icore/db-supabase';`,
        `import { MongoDbDBStrategy } from '@icore/db-mongodb';`,
        `import { FirestoreDBStrategy } from '@icore/db-firestore';`,
        `import { getFirebaseAdmin, FIREBASE_ADMIN_REQUIRED_ENV } from '@icore/firebase-admin';`,
        `import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';`,
        `import { Connection } from 'mongoose';`,
        `const REQUIRED_ENV = {`,
        `  supabase: ['SUPABASE_URL'],`,
        `  firestore: [...FIREBASE_ADMIN_REQUIRED_ENV],`,
        `  firebase: [...FIREBASE_ADMIN_REQUIRED_ENV],`,
        `  mongodb: ['MONGODB_URI'],`,
        `};`,
        `function requireEnv(cfg: ConfigService, key: string): string {`,
        `  return cfg.getOrThrow<string>(key);`,
        `}`,
        `function makeSupabaseDB(cfg: ConfigService): DBStrategy {`,
        `  return new SupabaseDBStrategy({ client: createClient('', '') as never });`,
        `}`,
        `function makeFirestoreDB(cfg: ConfigService): DBStrategy {`,
        `  void FirestoreDBStrategy;`,
        `  return getFirebaseAdmin(cfg).firestore() as never;`,
        `}`,
        `function makeMongoDb(connection: Connection): DBStrategy {`,
        `  return new MongoDbDBStrategy({ connection });`,
        `}`,
        `  MongooseModule.forRootAsync({`,
        `    useFactory: (cfg: ConfigService) => ({ uri: cfg.get('MONGODB_URI') }),`,
        `    inject: [ConfigService],`,
        `  }),`,
        `        if (provider === 'supabase') return makeSupabaseDB(cfg);`,
        `        if (provider === 'mongodb') return makeMongoDb(connection);`,
        `        return makeFirestoreDB(cfg);`,
        `      inject: [ConfigService, getConnectionToken()],`,
      ].join('\n'),
    );
    await writeFile(
      join(dir, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            '@icore/db-supabase': [''],
            '@icore/db-firestore': [''],
            '@icore/db-mongodb': [''],
          },
        },
      }),
    );
    await writeFile(
      join(dir, 'apps/microservices/notes/package.json'),
      JSON.stringify({
        name: 'notes',
        dependencies: {
          '@icore/db-supabase': '*',
          '@icore/db-firestore': '*',
          '@icore/db-mongodb': '*',
        },
      }),
    );

    await removeUnusedDbStrategies(dir, 'mongodb');

    await expect(access(join(dir, 'libs/db-strategies/supabase'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/db-strategies/firestore'))).rejects.toThrow();
    await expect(access(join(dir, 'libs/db-strategies/mongodb'))).resolves.toBeUndefined();

    const mod = await readFile(join(dir, 'apps/microservices/notes/src/app/app.module.ts'), 'utf8');
    expect(mod).not.toContain('@icore/db-supabase');
    expect(mod).not.toContain('@supabase/supabase-js');
    expect(mod).not.toContain('@icore/db-firestore');
    expect(mod).not.toContain('@icore/firebase-admin');
    expect(mod).not.toContain('makeSupabaseDB');
    expect(mod).not.toContain('makeFirestoreDB');
    expect(mod).toContain('@icore/db-mongodb');
    expect(mod).toContain('MongooseModule');
    expect(mod).toContain('makeMongoDb');
    expect(mod).toContain('return makeMongoDb(connection);');

    const tsconfig = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8')) as {
      compilerOptions: { paths: Record<string, unknown> };
    };
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/db-supabase');
    expect(tsconfig.compilerOptions.paths).not.toHaveProperty('@icore/db-firestore');
    expect(tsconfig.compilerOptions.paths).toHaveProperty('@icore/db-mongodb');

    const pkg = JSON.parse(
      await readFile(join(dir, 'apps/microservices/notes/package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-supabase');
    expect(pkg.dependencies).not.toHaveProperty('@icore/db-firestore');
    expect(pkg.dependencies).toHaveProperty('@icore/db-mongodb');
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

describe('rewriteRootPackageJson — broker transport driver deps', () => {
  async function run(transport: CreateIcoreOptions['transport']) {
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'icore', version: '1.0.0', dependencies: { ioredis: '^5.11.0' } }),
    );
    await rewriteRootPackageJson(dir, { ...baseOpts, targetDir: dir, transport });
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
  }

  it('adds the matching driver dep per broker transport (optional peer deps)', async () => {
    expect((await run('nats')).dependencies?.['nats']).toBeDefined();
    expect((await run('mqtt')).dependencies?.['mqtt']).toBeDefined();
    const rmq = (await run('rmq')).dependencies ?? {};
    expect(rmq['amqplib']).toBeDefined();
    expect(rmq['amqp-connection-manager']).toBeDefined();
    expect((await run('kafka')).dependencies?.['kafkajs']).toBeDefined();
  });

  it('adds no broker driver for tcp or redis (redis ships via the jobs stack)', async () => {
    for (const t of ['tcp', 'redis'] as const) {
      const deps = (await run(t)).dependencies ?? {};
      expect(deps['nats']).toBeUndefined();
      expect(deps['mqtt']).toBeUndefined();
      expect(deps['amqplib']).toBeUndefined();
      expect(deps['kafkajs']).toBeUndefined();
    }
  });
});

describe('api package dependencies', () => {
  it('keeps Express compatible with the payment peer dependency', async () => {
    const apiPkg = JSON.parse(await readFile(join(repoRoot, 'apps/api/package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(apiPkg.dependencies?.['@idevconn/payment']).toBe('^1.2.0');
    expect(apiPkg.dependencies?.['express']).toMatch(/^\^5\./);
    expect(apiPkg.devDependencies?.['@types/express']).toMatch(/^\^5\./);
  });
});

describe('writeAuthEnv — broker transport env', () => {
  it('uncomments the matching broker vars for mqtt/rmq/kafka', async () => {
    for (const [transport, expected] of [
      ['mqtt', 'AUTH_MQTT_URL=mqtt://localhost:1883'],
      ['rmq', 'AUTH_RMQ_QUEUE=auth_queue'],
      ['kafka', 'AUTH_KAFKA_BROKERS=localhost:9092'],
    ] as const) {
      await writeFile(
        join(dir, 'apps/microservices/auth/.env.example'),
        [
          'AUTH_TRANSPORT=tcp',
          'AUTH_PROVIDER=supabase',
          '# AUTH_MQTT_URL=mqtt://localhost:1883',
          '# AUTH_RMQ_URL=amqp://localhost:5672',
          '# AUTH_RMQ_QUEUE=auth_queue',
          '# AUTH_KAFKA_BROKERS=localhost:9092',
          '# AUTH_KAFKA_CLIENT_ID=auth',
        ].join('\n'),
      );
      await writeAuthEnv(dir, { ...baseOpts, targetDir: dir, transport });
      const env = await readFile(join(dir, 'apps/microservices/auth/.env'), 'utf8');
      expect(env).toContain(`AUTH_TRANSPORT=${transport}`);
      expect(env).toContain(expected);
      expect(env).not.toContain(`# ${expected}`);
    }
  });
});
