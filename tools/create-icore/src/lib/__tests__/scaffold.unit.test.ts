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
