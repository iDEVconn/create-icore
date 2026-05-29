import { copyFile, mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CreateIcoreOptions } from './options.js';

const IGNORE_TOP = new Set([
  '.git',
  'node_modules',
  '.yarn/cache',
  '.yarn/unplugged',
  '.yarn/install-state.gz',
  '.nx',
  'dist',
  'tmp',
  'coverage',
  '.idea',
  '.vscode',
]);

export async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_TOP.has(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(s, d);
    else if (entry.isFile()) await copyFile(s, d);
    // symlinks skipped intentionally
  }
}

export async function rewriteRootPackageJson(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  const pkgPath = join(targetDir, 'package.json');
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg['name'] = opts.projectName;
  pkg['version'] = '0.0.1';
  pkg['private'] = true;
  delete (pkg as { description?: string }).description;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

export async function writeAuthEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/microservices/auth/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_PROVIDER=.*$/m, `AUTH_PROVIDER=${opts.authProvider}`)
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    // Uncomment the matching transport URL line
    next = next.replace(/^# (AUTH_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/microservices/auth/.env'), next);
}

export async function writeUploadEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.upload === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/upload/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^STORAGE_PROVIDER=.*$/m, `STORAGE_PROVIDER=${opts.upload}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    next = next.replace(/^# (UPLOAD_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/microservices/upload/.env'), next);
}

export async function writeGatewayEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/api/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    next = next
      .replace(/^# (AUTH_(?:REDIS|NATS)_URL=)/m, '$1')
      .replace(/^# (UPLOAD_(?:REDIS|NATS)_URL=)/m, '$1');
  }
  await writeFile(join(targetDir, 'apps/api/.env'), next);
}

export async function writeRootEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const lines = [
    `# Database provider used by application data microservices.`,
    `# Independent of AUTH_PROVIDER — mix-and-match supported.`,
    `DB_PROVIDER=${opts.dbProvider}`,
    ``,
  ];
  await writeFile(join(targetDir, '.env'), lines.join('\n'));
}

export async function writePaymentEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.payment === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/payment/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    let next = env
      .replace(/^PAYMENT_PROVIDER=.*$/m, `PAYMENT_PROVIDER=${opts.payment}`)
      .replace(/^PAYMENT_TRANSPORT=.*$/m, `PAYMENT_TRANSPORT=${opts.transport}`);
    if (opts.transport !== 'tcp') {
      next = next.replace(/^# (PAYMENT_(?:REDIS|NATS)_URL=)/m, '$1');
    }
    await writeFile(join(targetDir, 'apps/microservices/payment/.env'), next);
  } catch {
    // payment MS not present in template — older snapshots predate Plan 9
  }
}

export async function removeJobsStack(targetDir: string): Promise<void> {
  const paths = [
    'apps/microservices/jobs',
    'libs/jobs-client',
    'apps/api/src/app/admin',
    'Dockerfile.ms-jobs',
  ];
  for (const p of paths) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const appModule = await readFile(appModulePath, 'utf8');
    const next = appModule
      .replace(/^import \{ AdminModule \} from '\.\/admin\/admin\.module';\n/m, '')
      .replace(/,\s*AdminModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore
  }
  // Strip the `jobs:` service block from docker-compose.yml + its depends_on entry.
  const composePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(composePath, 'utf8');
    const next = compose
      .replace(/\n {2}jobs:[\s\S]+?(?=\n {2}\w+:|\nnetworks:)/m, '\n')
      .replace(/\n {6}jobs:\n {8}condition: service_started/g, '')
      .replace(/\n {6}JOBS_REDIS_URL:[^\n]*/g, '');
    await writeFile(composePath, next);
  } catch {
    // ignore
  }
}

export async function removePaymentStack(targetDir: string): Promise<void> {
  const paths = [
    'apps/microservices/payment',
    'apps/microservices/payment-e2e',
    'libs/payment-client',
    'apps/api/src/app/payment',
  ];
  for (const p of paths) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const appModule = await readFile(appModulePath, 'utf8');
    const next = appModule
      .replace(/^import \{ PaymentModule \} from '\.\/payment\/payment\.module';\n/m, '')
      .replace(/,\s*PaymentModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore
  }
}

export async function removeUploadStack(targetDir: string): Promise<void> {
  const paths = [
    'apps/microservices/upload',
    'apps/microservices/upload-e2e',
    'libs/storage-strategies',
    'libs/upload-client',
    'apps/api/src/app/storage',
  ];
  for (const p of paths) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }
  // Also strip the StorageModule import + Storage routes from apps/api/src/app/app.module.ts
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const appModule = await readFile(appModulePath, 'utf8');
    const next = appModule
      .replace(/^import \{ StorageModule \} from '\.\/storage\/storage\.module';\n/m, '')
      .replace(/,\s*StorageModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // Ignore — app.module.ts may not exist in test scaffolds.
  }
  // Strip UPLOAD_* keys from the gateway .env (already present-style edit is fine; consumers rebuild)
  const gatewayEnv = join(targetDir, 'apps/api/.env');
  try {
    const env = await readFile(gatewayEnv, 'utf8');
    const next = env
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith('UPLOAD_') &&
          !line.startsWith('# UPLOAD_') &&
          !line.startsWith('MAX_FILE_SIZE_KB'),
      )
      .join('\n');
    await writeFile(gatewayEnv, next);
  } catch {
    // Ignore — .env may not exist in test scaffolds.
  }
}

export async function selectClientTemplate(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  // Drop the templates dir altogether and move the chosen template into apps/client.
  // shadcn (v0.1.0) and antd (v0.2.0) are fully implemented. mui falls back to shadcn.
  const templatesRoot = join(targetDir, 'apps/templates');
  const chosen = join(templatesRoot, `client-${opts.ui}`);
  const destClient = join(targetDir, 'apps/client');
  try {
    const s = await stat(chosen);
    if (!s.isDirectory()) throw new Error('not a dir');
  } catch {
    // mui not yet implemented (Plan 6.2) — fall back to shadcn
    await copyTree(join(templatesRoot, 'client-shadcn'), destClient);
    await rm(templatesRoot, { recursive: true, force: true });
    return;
  }
  await copyTree(chosen, destClient);
  await rm(templatesRoot, { recursive: true, force: true });
}

function gitInit(cwd: string, projectName: string): void {
  spawnSync('git', ['init'], { cwd, stdio: 'inherit' });
  spawnSync('git', ['add', '.'], { cwd, stdio: 'inherit' });
  spawnSync(
    'git',
    ['commit', '-m', `chore: bootstrap ${projectName} from @idevconn/create-icore`],
    { cwd, stdio: 'inherit' },
  );
}

function yarnInstall(cwd: string): void {
  spawnSync('yarn', ['install'], { cwd, stdio: 'inherit' });
}

export async function scaffold(opts: CreateIcoreOptions, templatesDir: string): Promise<void> {
  await copyTree(templatesDir, opts.targetDir);
  await rewriteRootPackageJson(opts.targetDir, opts);
  await writeAuthEnv(opts.targetDir, opts);
  await writeUploadEnv(opts.targetDir, opts);
  await writePaymentEnv(opts.targetDir, opts);
  await writeGatewayEnv(opts.targetDir, opts);
  await writeRootEnv(opts.targetDir, opts);
  await selectClientTemplate(opts.targetDir, opts);
  if (opts.upload === 'none') await removeUploadStack(opts.targetDir);
  if (opts.payment === 'none') await removePaymentStack(opts.targetDir);
  if (opts.jobs === 'none') await removeJobsStack(opts.targetDir);
  if (opts.install) yarnInstall(opts.targetDir);
  if (opts.initGit) gitInit(opts.targetDir, opts.projectName);
}
