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
  ui: 'shadcn',
  transport: 'tcp',
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
