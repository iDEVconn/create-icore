import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFeaturesWiring, cleanupUnusedFeatures } from '../wire-features.js';
import type { CreateIcoreOptions } from '../../lib/options.js';

const base: CreateIcoreOptions = {
  projectName: 'x',
  targetDir: '',
  authProvider: 'supabase',
  dbProvider: 'supabase',
  upload: 'supabase',
  payment: 'paypal',
  jobs: 'bullmq',
  example: 'notes',
  ui: 'shadcn',
  transport: 'tcp',
  packageManager: 'npm',
  initGit: false,
  install: false,
};

async function fixture(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'icore-feat-'));
  await mkdir(join(dir, 'apps/api/src/app'), { recursive: true });
  await mkdir(join(dir, 'apps/microservices/payment'), { recursive: true });
  await writeFile(join(dir, 'apps/microservices/payment/x'), 'x');
  await mkdir(join(dir, 'libs/payment-client'), { recursive: true });
  await writeFile(join(dir, 'libs/payment-client/x'), 'x');
  await writeFile(
    join(dir, 'apps/api/package.json'),
    JSON.stringify({
      name: 'api',
      dependencies: {
        '@icore/notes-client': '*',
        '@icore/payment-client': '*',
        '@icore/jobs-client': '*',
        '@idevconn/payment': '^1.2.0',
        '@casl/ability': '^7.0.0',
        '@bull-board/api': '^7.1.5',
        '@bull-board/express': '^7.1.5',
      },
    }),
  );
  await writeFile(
    join(dir, 'tsconfig.base.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          '@icore/notes-client': ['libs/notes-client/src/index.ts'],
          '@icore/payment-client': ['libs/payment-client/src/index.ts'],
          '@icore/jobs-client': ['libs/jobs-client/src/index.ts'],
        },
      },
    }),
  );
  await writeFile(
    join(dir, 'apps/api/.env'),
    'PAYMENT_TRANSPORT=tcp\nPAYMENT_HOST=127.0.0.1\nAUTH_TRANSPORT=tcp\n',
  );
  return dir;
}

const exists = (p: string) =>
  access(p)
    .then(() => true)
    .catch(() => false);

describe('writeFeaturesWiring', () => {
  it('features.module.ts imports only chosen gateway modules', async () => {
    const dir = await fixture();
    // notes on, payment off, jobs on
    await writeFeaturesWiring(dir, { ...base, targetDir: dir, payment: 'none' });
    const fm = await readFile(join(dir, 'apps/api/src/app/features.module.ts'), 'utf8');
    expect(fm).toContain("import { NotesModule } from './notes/notes.module';");
    expect(fm).toContain("import { AdminModule } from './admin/admin.module';");
    expect(fm).not.toContain('PaymentModule');
    expect(fm).toMatch(/imports:\s*\[NotesModule, AdminModule\]/);
  });

  it('gateway-services.ts lists auth+upload + chosen transport services (jobs excluded)', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, { ...base, targetDir: dir });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).toContain("{ name: 'auth', prefix: 'AUTH' }");
    expect(gs).toContain("{ name: 'upload', prefix: 'UPLOAD' }");
    expect(gs).toContain("{ name: 'notes', prefix: 'NOTES' }");
    expect(gs).toContain("{ name: 'payment', prefix: 'PAYMENT' }");
    // jobs has no gatewayService
    expect(gs).not.toContain("'jobs'");
  });

  it('omits upload service when upload=none', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, { ...base, targetDir: dir, upload: 'none' });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).not.toContain("{ name: 'upload', prefix: 'UPLOAD' }");
  });

  it('omits auth entry in gateway-services.ts when authProvider is none', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, {
      ...base,
      targetDir: dir,
      authProvider: 'none',
      dbProvider: 'none',
      example: 'none',
      payment: 'none',
      jobs: 'none',
      upload: 'supabase',
    });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).not.toContain("name: 'auth'");
    expect(gs).toContain("name: 'upload'");
  });

  it('includes auth entry in gateway-services.ts when authProvider is supabase', async () => {
    const dir = await fixture();
    await writeFeaturesWiring(dir, {
      ...base,
      targetDir: dir,
      payment: 'none',
      jobs: 'none',
      example: 'none',
    });
    const gs = await readFile(join(dir, 'apps/api/src/app/gateway-services.ts'), 'utf8');
    expect(gs).toContain("name: 'auth'");
  });
});

describe('cleanupUnusedFeatures', () => {
  it('removes libs/shared/src/jobs.ts and its re-export when jobs=none', async () => {
    const dir = await fixture();
    await mkdir(join(dir, 'libs/shared/src'), { recursive: true });
    await writeFile(join(dir, 'libs/shared/src/jobs.ts'), 'export const QUEUE = "q";');
    await writeFile(
      join(dir, 'libs/shared/src/index.ts'),
      "export * from './env';\nexport * from './jobs';\nexport * from './transport';\n",
    );
    await cleanupUnusedFeatures(dir, { ...base, targetDir: dir, jobs: 'none' });
    await expect(access(join(dir, 'libs/shared/src/jobs.ts'))).rejects.toThrow();
    const src = await readFile(join(dir, 'libs/shared/src/index.ts'), 'utf8');
    expect(src).not.toContain("'./jobs'");
    expect(src).toContain("'./env'");
    expect(src).toContain("'./transport'");
  });

  it('rm unchosen feature libDirs + strips their gateway deps/tsPaths + transport block', async () => {
    const dir = await fixture();
    // payment OFF -> its dirs/deps/tsPath/PAYMENT_ env gone; notes+jobs kept
    await cleanupUnusedFeatures(dir, { ...base, targetDir: dir, payment: 'none' });

    expect(await exists(join(dir, 'apps/microservices/payment'))).toBe(false);
    expect(await exists(join(dir, 'libs/payment-client'))).toBe(false);

    const pkg = JSON.parse(await readFile(join(dir, 'apps/api/package.json'), 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('@icore/payment-client');
    expect(pkg.dependencies).not.toHaveProperty('@idevconn/payment');
    expect(pkg.dependencies['@icore/notes-client']).toBe('*'); // notes kept
    expect(pkg.dependencies['@icore/jobs-client']).toBe('*'); // jobs kept

    const ts = JSON.parse(await readFile(join(dir, 'tsconfig.base.json'), 'utf8'));
    expect(ts.compilerOptions.paths).not.toHaveProperty('@icore/payment-client');

    const env = await readFile(join(dir, 'apps/api/.env'), 'utf8');
    expect(env).not.toMatch(/^PAYMENT_/m);
    expect(env).toContain('AUTH_TRANSPORT=tcp'); // untouched
  });
});
