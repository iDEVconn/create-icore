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

async function stripDeps(pkgPath: string, names: string[]): Promise<void> {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const n of names) {
      if (pkg.dependencies) delete pkg.dependencies[n];
      if (pkg.devDependencies) delete pkg.devDependencies[n];
    }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // ignore — pkg may not exist in test scaffolds
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
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/jobs-client',
    '@bull-board/api',
    '@bull-board/express',
  ]);
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
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/payment-client',
    '@idevconn/payment',
  ]);
}

export async function removeNotesStack(targetDir: string): Promise<void> {
  // Delete MS, lib, gateway module, and shadcn-only notes components dir
  for (const p of [
    'apps/microservices/notes',
    'apps/microservices/notes-e2e',
    'libs/notes-client',
    'apps/api/src/app/notes',
    'apps/client/src/components/notes',
  ]) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }

  // Delete individual client files
  await rm(join(targetDir, 'apps/client/src/routes/_dashboard/notes.tsx'), { force: true });
  await rm(join(targetDir, 'apps/client/src/queries/notes.ts'), { force: true });

  // Strip NotesModule from gateway app.module.ts
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const src = await readFile(appModulePath, 'utf8');
    const next = src
      .replace(/^import \{ NotesModule \} from '\.\/notes\/notes\.module';\n/m, '')
      .replace(/,\s*NotesModule/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore — app.module.ts may not exist in test scaffolds
  }

  // Strip @icore/notes-client dep from api/package.json
  await stripDeps(join(targetDir, 'apps/api/package.json'), ['@icore/notes-client']);

  // Strip @icore/notes-client path alias from tsconfig.base.json
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  try {
    const src = await readFile(tsconfigPath, 'utf8');
    const next = src.replace(/^\s*"@icore\/notes-client": \[[^\]]*\],?\n/m, '');
    await writeFile(tsconfigPath, next);
  } catch {
    // ignore
  }

  // Strip notes nav from LayoutSider — handles shadcn, antd and mui variants
  const siderPath = join(targetDir, 'apps/client/src/components/layout/LayoutSider.tsx');
  try {
    const src = await readFile(siderPath, 'utf8');
    const next = src
      // shadcn: remove StickyNote from lucide import + notes Link block
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/Link>/, '')
      // antd: remove FileTextOutlined + selectedKey notes branch + notes items entry
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        "\n    {\n      key: 'notes',\n      icon: <FileTextOutlined />,\n      label: <Link to=\"/_dashboard/notes\">{t('notes.title')}</Link>,\n    },",
        '',
      )
      // mui: remove NoteOutlinedIcon import + notes ListItemButton
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/_dashboard\/notes"[\s\S]*?<\/ListItemButton>/,
        '',
      )
      // test stub: remove simple notes link
      .replace(/\n\s*<Link to="\/_dashboard\/notes">[\s\S]*?<\/Link>/m, '');
    await writeFile(siderPath, next);
  } catch {
    // ignore
  }

  // Strip notes block from template-shared i18n keys.ts
  const keysPath = join(targetDir, 'libs/template-shared/src/lib/i18n/keys.ts');
  try {
    const src = await readFile(keysPath, 'utf8');
    const next = src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, '');
    await writeFile(keysPath, next);
  } catch {
    // ignore
  }
}

async function stripTsconfigPath(targetDir: string, alias: string): Promise<void> {
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  try {
    const src = await readFile(tsconfigPath, 'utf8');
    // Try pretty-printed regex first (preserves formatting for real tsconfig files)
    const escaped = alias.replace(/[@/]/g, (c) => (c === '@' ? '@' : '\\/'));
    const pretty = src.replace(new RegExp(`^\\s*"${escaped}": \\[[^\\]]*\\],?\\n`, 'm'), '');
    if (pretty !== src) {
      await writeFile(tsconfigPath, pretty);
      return;
    }
    // Fall back to JSON parse+rewrite for compact JSON (test scaffolds)
    const parsed = JSON.parse(src) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    if (parsed.compilerOptions?.paths) {
      delete parsed.compilerOptions.paths[alias];
    }
    await writeFile(tsconfigPath, JSON.stringify(parsed));
  } catch {
    // ignore — tsconfig may not exist in test scaffolds
  }
}

export async function removeUnusedAuthStrategies(
  targetDir: string,
  authProvider: string,
): Promise<void> {
  const modulePath = join(targetDir, 'apps/microservices/auth/src/app/app.module.ts');

  if (authProvider === 'supabase') {
    await rm(join(targetDir, 'libs/auth-strategies/firebase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-firebase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-firebase');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(/^import \{[^}]*FirebaseAuthStrategy[^}]*\} from '@icore\/auth-firebase';\n/m, '')
        .replace(/^function makeFirebaseStrategy\b[\s\S]*?\n^}\n/m, '')
        .replace(/(?<=\n) *case 'firebase':\n *return makeFirebaseStrategy\(cfg\);\n/, '');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (authProvider === 'firebase') {
    await rm(join(targetDir, 'libs/auth-strategies/supabase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-supabase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-supabase');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(/^import \{[^}]*SupabaseAuthStrategy[^}]*\} from '@icore\/auth-supabase';\n/m, '')
        .replace(
          /\n {10}case 'supabase': \{[\s\S]*?return new SupabaseAuthStrategy\(\{ client \}\);\n {10}\}\n/m,
          '',
        );
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }
}

export async function removeUnusedStorageStrategies(
  targetDir: string,
  uploadProvider: string,
): Promise<void> {
  if (uploadProvider === 'none') return;
  const modulePath = join(targetDir, 'apps/microservices/upload/src/app/app.module.ts');

  if (uploadProvider !== 'firebase') {
    await rm(join(targetDir, 'libs/storage-strategies/firebase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      '@icore/storage-firebase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/storage-firebase');
  }
  if (uploadProvider !== 'cloudinary') {
    await rm(join(targetDir, 'libs/storage-strategies/cloudinary'), {
      recursive: true,
      force: true,
    });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      '@icore/storage-cloudinary',
    ]);
    await stripTsconfigPath(targetDir, '@icore/storage-cloudinary');
  }
  if (uploadProvider !== 'supabase') {
    await rm(join(targetDir, 'libs/storage-strategies/supabase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      '@icore/storage-supabase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/storage-supabase');
  }

  try {
    let src = await readFile(modulePath, 'utf8');
    if (uploadProvider !== 'firebase') {
      src = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(
          /^import \{[^}]*FirebaseStorageStrategy[^}]*\} from '@icore\/storage-firebase';\n/m,
          '',
        )
        .replace(/^function makeFirebaseStorage\b[\s\S]*?\n^}\n/m, '')
        .replace(/(?<=\n) *case 'firebase':\n *return makeFirebaseStorage\(cfg\);\n/, '');
    }
    if (uploadProvider !== 'cloudinary') {
      src = src
        .replace(/^import \{ v2 as cloudinary \} from 'cloudinary';\n/m, '')
        .replace(
          /^import \{[^}]*CloudinaryStorageStrategy[^}]*\} from '@icore\/storage-cloudinary';\n/m,
          '',
        )
        .replace(/^function makeCloudinaryStorage\b[\s\S]*?\n^}\n/m, '')
        .replace(/(?<=\n) *case 'cloudinary':\n *return makeCloudinaryStorage\(cfg\);\n/, '');
    }
    if (uploadProvider !== 'supabase') {
      src = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(
          /^import \{[^}]*SupabaseStorageStrategy[^}]*\} from '@icore\/storage-supabase';\n/m,
          '',
        )
        .replace(
          /\n {10}case 'supabase': \{[\s\S]*?bucket: requireEnv\(cfg, 'SUPABASE_STORAGE_BUCKET'\),\n {12}\}\);\n {10}\}\n/m,
          '',
        );
    }
    await writeFile(modulePath, src);
  } catch {
    // ignore
  }
}

export async function removeUnusedDbStrategies(
  targetDir: string,
  dbProvider: string,
): Promise<void> {
  const modulePath = join(targetDir, 'apps/microservices/notes/src/app/app.module.ts');

  if (dbProvider === 'supabase') {
    await rm(join(targetDir, 'libs/db-strategies/firestore'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-firestore',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-firestore');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(/^import \{[^}]*FirestoreDBStrategy[^}]*\} from '@icore\/db-firestore';\n/m, '')
        .replace(
          /\n {8}if \(provider === 'firestore'[\s\S]*?return new FirestoreDBStrategy\(\{[\s\S]*?\}\);\n {8}\}\n/m,
          '',
        );
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (dbProvider === 'firebase') {
    await rm(join(targetDir, 'libs/db-strategies/supabase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-supabase',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-supabase');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(/^import \{[^}]*SupabaseDBStrategy[^}]*\} from '@icore\/db-supabase';\n/m, '')
        .replace(
          /\n {8}if \(provider === 'supabase'\) \{[\s\S]*?return new SupabaseDBStrategy\(\{ client \}\);\n {8}\}\n/m,
          '',
        );
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
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
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/upload-client',
    '@types/multer',
  ]);
}

export async function selectClientTemplate(
  targetDir: string,
  opts: CreateIcoreOptions,
): Promise<void> {
  // Drop the templates dir altogether and move the chosen template into apps/client.
  const templatesRoot = join(targetDir, 'apps/templates');
  const chosen = join(templatesRoot, `client-${opts.ui}`);
  const destClient = join(targetDir, 'apps/client');
  let chosenUi = opts.ui;
  try {
    const s = await stat(chosen);
    if (!s.isDirectory()) throw new Error('not a dir');
    await copyTree(chosen, destClient);
  } catch {
    chosenUi = 'shadcn';
    await copyTree(join(templatesRoot, 'client-shadcn'), destClient);
  }
  await rm(templatesRoot, { recursive: true, force: true });
  await rewriteClientPaths(destClient, chosenUi);
}

async function rewriteClientPaths(clientDir: string, ui: string): Promise<void> {
  // Templates lived under `apps/templates/client-<ui>/` — 3 levels deep.
  // Scaffolded into `apps/client/` — 2 levels deep. Every `../../../` path
  // anchored at the repo root needs to lose one segment, and the original
  // `client-<ui>` folder name baked into cacheDir/outDir strings becomes
  // plain `client`.
  const candidates = [
    'vite.config.mts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.spec.json',
    'project.json',
    'eslint.config.mjs',
  ];
  for (const rel of candidates) {
    const path = join(clientDir, rel);
    try {
      const raw = await readFile(path, 'utf8');
      const next = raw
        .replaceAll('../../../', '../../')
        .replaceAll(`apps/templates/client-${ui}`, 'apps/client')
        .replaceAll(`client-${ui}`, 'client');
      if (next !== raw) await writeFile(path, next);
    } catch {
      // file may not exist in this template variant
    }
  }
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
  if (opts.example === 'none') await removeNotesStack(opts.targetDir);
  await removeUnusedAuthStrategies(opts.targetDir, opts.authProvider);
  await removeUnusedStorageStrategies(opts.targetDir, opts.upload);
  await removeUnusedDbStrategies(opts.targetDir, opts.dbProvider);
  // Anchor yarn 4 to this directory. Without an empty yarn.lock yarn walks up
  // through parent directories and may pick up a stray package.json/yarn.lock
  // (e.g. in the user's $HOME), causing
  //   "The nearest package directory doesn't seem to be part of the project"
  // on first `yarn install`.
  await writeFile(join(opts.targetDir, 'yarn.lock'), '');
  if (opts.install) yarnInstall(opts.targetDir);
  if (opts.initGit) gitInit(opts.targetDir, opts.projectName);
}
