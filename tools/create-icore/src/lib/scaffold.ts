import { copyFile, mkdir, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pmRun } from './options.js';
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
  // Remove yarn-specific packageManager field for npm/pnpm so corepack doesn't reject them
  if (opts.packageManager !== 'yarn') {
    delete (pkg as { packageManager?: string }).packageManager;
  }
  // pnpm 9+ blocks all build scripts by default — explicitly allow the packages
  // that require native compilation (nx, swc, parcel-watcher, etc.)
  if (opts.packageManager === 'pnpm') {
    pkg['pnpm'] = {
      onlyBuiltDependencies: [
        '@firebase/util',
        '@nestjs/core',
        '@parcel/watcher',
        '@scarf/scarf',
        '@swc/core',
        'less',
        'msgpackr-extract',
        'nx',
        'protobufjs',
        'unrs-resolver',
      ],
    };
  }
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

export async function writeNotesEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  if (opts.example === 'none') return;
  const envExample = join(targetDir, 'apps/microservices/notes/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    let next = env.replace(/^NOTES_TRANSPORT=.*$/m, `NOTES_TRANSPORT=${opts.transport}`);
    if (opts.transport !== 'tcp') {
      next = next.replace(/^# (NOTES_(?:REDIS|NATS)_URL=)/m, '$1');
    }
    await writeFile(join(targetDir, 'apps/microservices/notes/.env'), next);
  } catch {
    // notes .env.example may not exist in older snapshots
  }
}

export async function writeGatewayEnv(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const envExample = join(targetDir, 'apps/api/.env.example');
  const env = await readFile(envExample, 'utf8');
  let next = env
    .replace(/^AUTH_TRANSPORT=.*$/m, `AUTH_TRANSPORT=${opts.transport}`)
    .replace(/^UPLOAD_TRANSPORT=.*$/m, `UPLOAD_TRANSPORT=${opts.transport}`)
    .replace(/^NOTES_TRANSPORT=.*$/m, `NOTES_TRANSPORT=${opts.transport}`)
    .replace(/^PAYMENT_TRANSPORT=.*$/m, `PAYMENT_TRANSPORT=${opts.transport}`);
  if (opts.transport !== 'tcp') {
    next = next
      .replace(/^# (AUTH_(?:REDIS|NATS)_URL=)/m, '$1')
      .replace(/^# (UPLOAD_(?:REDIS|NATS)_URL=)/m, '$1')
      .replace(/^# (NOTES_(?:REDIS|NATS)_URL=)/m, '$1')
      .replace(/^# (PAYMENT_(?:REDIS|NATS)_URL=)/m, '$1');
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

/**
 * Strips a transport prefix (e.g. `NOTES`, `PAYMENT`) and its comment lines
 * from the gateway .env when the matching microservice is removed, so the
 * gateway doesn't try to build a transport for a MS that isn't there.
 */
async function stripGatewayTransport(targetDir: string, prefix: string): Promise<void> {
  const gatewayEnv = join(targetDir, 'apps/api/.env');
  try {
    const env = await readFile(gatewayEnv, 'utf8');
    const next = env
      .split('\n')
      .filter(
        (line) =>
          !line.startsWith(`${prefix}_`) &&
          !line.startsWith(`# ${prefix}_`) &&
          !line.includes(`${prefix} MS transport`),
      )
      .join('\n');
    await writeFile(gatewayEnv, next);
  } catch {
    // ignore — .env may not exist in test scaffolds
  }
}

export async function writeClientEnv(targetDir: string): Promise<void> {
  const envExample = join(targetDir, 'apps/client/.env.example');
  try {
    const env = await readFile(envExample, 'utf8');
    await writeFile(join(targetDir, 'apps/client/.env'), env);
  } catch {
    // .env.example may not exist in older snapshots
  }
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
  await stripGatewayTransport(targetDir, 'PAYMENT');
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

  // Strip NOTES_* transport block from the gateway .env
  await stripGatewayTransport(targetDir, 'NOTES');

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

  // The factory branch is two lines:
  //   if (provider === 'supabase') return makeSupabaseAuth(cfg);
  //   return makeFirebaseAuth(cfg);
  const AUTH_BRANCH =
    /if \(provider === 'supabase'\) return makeSupabaseAuth\(cfg\);\n\s*return makeFirebaseAuth\(cfg\);/m;

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
        .replace(/\nfunction makeFirebaseAuth[\s\S]*?\n}\n/m, '')
        .replace(AUTH_BRANCH, 'return makeSupabaseAuth(cfg);');
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
        .replace(/\nfunction makeSupabaseAuth[\s\S]*?\n}\n/m, '')
        .replace(AUTH_BRANCH, 'return makeFirebaseAuth(cfg);');
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
    // Remove the imports + factory functions of the providers NOT chosen.
    if (uploadProvider !== 'firebase') {
      src = src
        .replace(/^import \* as admin from 'firebase-admin';\n/m, '')
        .replace(
          /^import \{[^}]*FirebaseStorageStrategy[^}]*\} from '@icore\/storage-firebase';\n/m,
          '',
        )
        .replace(/\nfunction makeFirebaseStorage[\s\S]*?\n}\n/m, '');
    }
    if (uploadProvider !== 'cloudinary') {
      src = src
        .replace(/^import \{ v2 as cloudinary \} from 'cloudinary';\n/m, '')
        .replace(
          /^import \{[^}]*CloudinaryStorageStrategy[^}]*\} from '@icore\/storage-cloudinary';\n/m,
          '',
        )
        .replace(/\nfunction makeCloudinaryStorage[\s\S]*?\n}\n/m, '');
    }
    if (uploadProvider !== 'supabase') {
      src = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/m, '')
        .replace(
          /^import \{[^}]*SupabaseStorageStrategy[^}]*\} from '@icore\/storage-supabase';\n/m,
          '',
        )
        .replace(/\nfunction makeSupabaseStorage[\s\S]*?\n}\n/m, '');
    }
    // Collapse the 3-line provider branch to a single return for the chosen one.
    const STORAGE_BRANCH =
      /if \(provider === 'supabase'\) return makeSupabaseStorage\(cfg\);\n\s*if \(provider === 'firebase'\) return makeFirebaseStorage\(cfg\);\n\s*return makeCloudinaryStorage\(cfg\);/m;
    const chosenReturn = `return make${uploadProvider.charAt(0).toUpperCase() + uploadProvider.slice(1)}Storage(cfg);`;
    src = src.replace(STORAGE_BRANCH, chosenReturn);
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
        // drop the makeFirestoreDB factory function
        .replace(/\nfunction makeFirestoreDB[\s\S]*?\n}\n/m, '')
        // collapse the provider branch to an unconditional supabase return
        .replace(
          /if \(provider === 'supabase'\) return makeSupabaseDB\(cfg\);\n\s*return makeFirestoreDB\(cfg\);/m,
          'return makeSupabaseDB(cfg);',
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
        // drop the makeSupabaseDB factory function
        .replace(/\nfunction makeSupabaseDB[\s\S]*?\n}\n/m, '')
        // collapse the provider branch to an unconditional firestore return
        .replace(
          /if \(provider === 'supabase'\) return makeSupabaseDB\(cfg\);\n\s*return makeFirestoreDB\(cfg\);/m,
          'return makeFirestoreDB(cfg);',
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

function resolveYarnBin(cwd: string): string {
  // Read yarnPath from .yarnrc.yml so upgrading yarn version only requires
  // updating the template files — no hardcoded version string here.
  try {
    const yarnrc = readFileSync(join(cwd, '.yarnrc.yml'), 'utf8');
    const match = yarnrc.match(/^yarnPath:\s*(.+)$/m);
    if (match?.[1]) return join(cwd, match[1].trim());
  } catch {
    // ignore — fallback below
  }
  return join(cwd, '.yarn', 'releases', 'yarn-4.5.0.cjs');
}

function runInstall(cwd: string, pm: string): void {
  if (pm === 'yarn') {
    // Run the pinned yarn binary directly via node to avoid corepack PnP
    // resolution failures when the CLI is invoked from `yarn create` (dlx),
    // which runs inside a PnP context where corepack cannot resolve itself.
    spawnSync('node', [resolveYarnBin(cwd), 'install'], { cwd, stdio: 'inherit' });
  } else if (pm === 'npm') {
    spawnSync('npm', ['install'], { cwd, stdio: 'inherit' });
  } else {
    spawnSync('pnpm', ['install'], { cwd, stdio: 'inherit' });
  }
}

export async function scaffold(opts: CreateIcoreOptions, templatesDir: string): Promise<void> {
  await copyTree(templatesDir, opts.targetDir);
  await rewriteRootPackageJson(opts.targetDir, opts);
  await writeAuthEnv(opts.targetDir, opts);
  await writeUploadEnv(opts.targetDir, opts);
  await writeNotesEnv(opts.targetDir, opts);
  await writePaymentEnv(opts.targetDir, opts);
  await writeGatewayEnv(opts.targetDir, opts);
  await writeRootEnv(opts.targetDir, opts);
  await selectClientTemplate(opts.targetDir, opts);
  await writeClientEnv(opts.targetDir);
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
  // Empty yarn.lock anchors yarn 4 to this directory (prevents walking up to parent workspaces).
  // Only needed when using yarn; for npm/pnpm it's harmless but we skip it to keep the
  // generated project tidy.
  if (opts.packageManager === 'yarn') {
    await writeFile(join(opts.targetDir, 'yarn.lock'), '');
  } else {
    // npm/pnpm don't need the pinned yarn binary or .yarnrc.yml.
    // Removing them keeps the generated project tidy and prevents the 2.8 MB
    // yarn-4.x.cjs binary from being committed to git (the template .gitignore
    // has !.yarn/releases which un-ignores it for yarn users).
    await rm(join(opts.targetDir, '.yarn'), { recursive: true, force: true });
    await rm(join(opts.targetDir, '.yarnrc.yml'), { force: true });
  }
  await patchGitignoreForPm(opts.targetDir, opts.packageManager);
  await writeAiFiles(opts.targetDir, opts);
  if (opts.install) runInstall(opts.targetDir, opts.packageManager);
  if (opts.initGit) gitInit(opts.targetDir, opts.projectName);
}

// ── .gitignore patching ─────────────────────────────────────────────────────

/**
 * Adjusts .gitignore for the chosen package manager:
 * - npm/pnpm: remove the `!.yarn/releases` un-ignore rule (the yarn binary
 *   is already deleted, but the pattern would apply to any .yarn dir the user
 *   might later add). Adds pnpm-specific entries.
 * - npm: adds npm-debug.log pattern if missing.
 */
async function patchGitignoreForPm(targetDir: string, pm: string): Promise<void> {
  const giPath = join(targetDir, '.gitignore');
  try {
    let src = await readFile(giPath, 'utf8');

    // Strip lines that are icore-internal and make no sense in a generated project.
    src = src.replace(/^# Build artifacts.*\ntools\/create-icore\/templates\/\s*\n/m, '');

    if (pm !== 'yarn') {
      // Drop the yarn-specific un-ignore rules — .yarn/ is fully gone for non-yarn.
      src = src
        .replace(/^\.yarn\/\*\s*\n/m, '')
        .replace(/^!\.yarn\/patches\s*\n/m, '')
        .replace(/^!\.yarn\/plugins\s*\n/m, '')
        .replace(/^!\.yarn\/releases\s*\n/m, '')
        .replace(/^!\.yarn\/sdks\s*\n/m, '')
        .replace(/^!\.yarn\/versions\s*\n/m, '')
        .replace(/^\.pnp\.\*\s*\n/m, '');
    }

    if (pm === 'pnpm') {
      if (!src.includes('.pnpm-debug.log')) {
        src += '\n# pnpm\n.pnpm-debug.log*\n';
      }
    }

    if (pm === 'npm') {
      if (!src.includes('npm-debug.log')) {
        src += '\n# npm\nnpm-debug.log*\n';
      }
    }

    await writeFile(giPath, src);
  } catch {
    // ignore — .gitignore may not exist in test scaffolds
  }
}

// ── AI-ready files ──────────────────────────────────────────────────────────

/** Writes CLAUDE.md, AGENTS.md, and .claude/settings.json. */
export async function writeAiFiles(targetDir: string, opts: CreateIcoreOptions): Promise<void> {
  const pm = opts.packageManager;
  const nx = pm === 'npm' ? 'npx nx' : `${pm} nx`;
  const devCmd = pmRun(pm, 'dev');

  const activeMSes = ['auth (port 4001)'];
  if (opts.upload !== 'none') activeMSes.push(`upload (port 4002)`);
  if (opts.payment !== 'none') activeMSes.push(`payment (port 4003)`);
  if (opts.example !== 'none') activeMSes.push(`notes (port 4004)`);
  if (opts.jobs !== 'none') activeMSes.push(`jobs (standalone)`);

  const usesSupabase =
    opts.authProvider === 'supabase' ||
    opts.dbProvider === 'supabase' ||
    opts.upload === 'supabase';
  const usesFirebase =
    opts.authProvider === 'firebase' ||
    opts.dbProvider === 'firebase' ||
    opts.upload === 'firebase';

  // ── CLAUDE.md ──────────────────────────────────────────────────────────────
  await writeFile(join(targetDir, 'CLAUDE.md'), '@AGENTS.md\n');

  // ── README.md ──────────────────────────────────────────────────────────────
  const uiLabel = { shadcn: 'shadcn/ui + Tailwind', antd: 'Ant Design 6', mui: 'MUI 6' }[opts.ui];
  const readme = `# ${opts.projectName}

> Scaffolded with [iCore](https://github.com/iDEVconn/create-icore) — Nx + NestJS + React full-stack template.

## Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx + ${pm} |
| Gateway | NestJS 11 + Swagger |
| Auth | ${opts.authProvider} |
| Database | ${opts.dbProvider} |
| Upload | ${opts.upload === 'none' ? '—' : opts.upload} |
| UI | ${uiLabel} + TanStack Router + Query |
| i18n | i18next (en / ru / he) |

## Quick start

\`\`\`bash
# 1. Fill in provider credentials
#    apps/microservices/auth/.env
#    apps/microservices/upload/.env  (if upload is enabled)
#    apps/client/.env               (VITE_API_URL — already defaults to /api)

# 2. Start everything
${devCmd}
# → http://localhost:4200        client
# → http://localhost:3001/api/docs  Swagger
\`\`\`

## Commands

\`\`\`bash
${nx} run <project>:serve   # start a single service
${nx} test <project>         # unit tests
${nx} lint <project>         # lint
${nx} build <project>        # production build
${pm === 'yarn' ? 'yarn remove-notes' : pm === 'pnpm' ? 'pnpm remove-notes' : 'npm run remove-notes'}                  # strip the notes sample feature
\`\`\`

## Scaffolded by

[iCore](https://github.com/iDEVconn/create-icore) — [@idevconn/create-icore](https://www.npmjs.com/package/@idevconn/create-icore)

## License

Apache-2.0
`;
  await writeFile(join(targetDir, 'README.md'), readme);

  // ── AGENTS.md ──────────────────────────────────────────────────────────────
  const agents = `# ${opts.projectName} — Agent Instructions

## Stack snapshot

| Dimension  | Choice |
|------------|--------|
| Auth       | ${opts.authProvider} |
| Database   | ${opts.dbProvider} |
| Upload     | ${opts.upload} |
| Payment    | ${opts.payment} |
| Jobs       | ${opts.jobs} |
| UI         | ${opts.ui} |
| Transport  | ${opts.transport} |
| PM         | ${pm} |

## 🚀 Mandatory Workflow

- **Branch strategy**: \`dev\` is default. Cut \`feature/<name>\` or \`bug/<name>\` from dev. PRs only target dev. Never push directly to main.
- **No code without approval**: Propose changes first, wait for go-ahead.
- **ЗАКОН — no crash on missing .env**: MS factories must catch config errors, print a boxed banner with ALL missing vars, and return a Fake strategy in dev. In prod (\`NODE_ENV=production\`) throw the same banner. The \`formatEnvBanner\` + \`missingEnv\` helpers from \`@icore/shared\` handle this.
- **Post-coding routine**: \`npx prettier --write <files>\` → \`${nx} lint <project>\` → \`${nx} build <project>\` — all green before committing.
- **Nx generators only**: never hand-write \`project.json\` / tsconfig stacks. Use \`${nx} g @nx/<plugin>:<schematic>\`.

## Architecture

\`\`\`
apps/
├── api/               NestJS gateway — all client traffic enters here (:3001)
├── microservices/
${activeMSes.map((s) => `│   ├── ${s.split(' ')[0]}/`).join('\n')}
└── client/            Vite + React 19 + ${opts.ui} (:4200)
libs/
├── shared/            contracts, CASL, transport helpers, env banner utils
├── auth-strategies/${opts.authProvider}/
${opts.upload !== 'none' ? `├── storage-strategies/${opts.upload}/\n` : ''}├── db-strategies/${opts.dbProvider === 'firebase' ? 'firestore' : opts.dbProvider}/
├── auth-client/       gateway → auth MS (TCP/Redis/NATS)
${opts.upload !== 'none' ? `├── upload-client/     gateway → upload MS\n` : ''}└── template-shared/   browser-safe React foundation (stores, i18n, CASL)
\`\`\`

## Key patterns

**Strategy swap** — provider is chosen at runtime via env. Never import a concrete strategy in app code; always inject via the factory token (\`AuthStrategy\`, \`StorageStrategy\`, \`DBStrategy\`).

**Transport** — \`buildTransport(prefix)\` reads \`${opts.transport.toUpperCase()}*\` vars. Same helper on gateway client-modules and each MS \`main.ts\`. Supports tcp / redis / nats — change by flipping \`*_TRANSPORT\` in \`.env\`.

**Env layering**:
1. Root \`.env\` — \`DB_PROVIDER\`
2. \`apps/api/.env\` — gateway transport endpoints
3. \`apps/microservices/<name>/.env\` — each MS provider + transport
4. \`apps/client/.env\` — \`VITE_API_URL\`

## Commands

\`\`\`bash
${devCmd}                     # start all services
${nx} run api:serve           # gateway only
${nx} run auth:serve          # auth MS only
${nx} test <project>          # run tests
${nx} lint <project>          # lint
${nx} build <project>         # build
${nx} g @nx/nest:resource     # generate NestJS resource
\`\`\`

## .env files to configure

| File | Key vars |
|------|----------|
| \`apps/microservices/auth/.env\` | \`AUTH_PROVIDER=${opts.authProvider}\`, ${opts.authProvider === 'supabase' ? '`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`' : '`FB_ADMIN_*`, `FIREBASE_WEB_API_KEY`'} |
${opts.upload !== 'none' ? `| \`apps/microservices/upload/.env\` | \`STORAGE_PROVIDER=${opts.upload}\`, provider creds |\n` : ''}| \`apps/microservices/notes/.env\` | \`DB_PROVIDER=${opts.dbProvider}\`, DB creds |
| \`apps/client/.env\` | \`VITE_API_URL=/api\` (proxied to :3001 in dev) |

## Testing

- Unit tests: Vitest, files named \`*.unit.test.ts(x)\` in \`__tests__/\` next to source.
- Test behaviour, not implementation. Fake strategies from \`@icore/shared\` (FakeAuthStrategy etc.) serve as test doubles.
- Run: \`${nx} test <project>\`
`;

  await writeFile(join(targetDir, 'AGENTS.md'), agents);

  // ── .claude/settings.json ─────────────────────────────────────────────────
  await mkdir(join(targetDir, '.claude'), { recursive: true });

  const mcpServers: Record<string, unknown> = {
    nx: {
      command: 'npx',
      args: ['-y', '@nx/mcp@latest', '--directory', '.'],
      type: 'stdio',
    },
  };

  if (usesSupabase) {
    mcpServers['supabase'] = {
      command: 'npx',
      args: [
        '-y',
        '@supabase/mcp-server-supabase@latest',
        '--access-token',
        '<SUPABASE_PERSONAL_ACCESS_TOKEN>',
      ],
      type: 'stdio',
    };
  }

  if (usesFirebase) {
    mcpServers['firebase'] = {
      command: 'npx',
      args: ['-y', 'firebase-tools@latest', 'experimental:mcp'],
      type: 'stdio',
    };
  }

  const nxCmds = [`Bash(${nx} *)`, `Bash(${devCmd})`];
  if (pm !== 'npm') nxCmds.push(`Bash(npx nx *)`);

  const settings = {
    mcpServers,
    permissions: {
      allow: [
        ...nxCmds,
        'Bash(npx prettier *)',
        'Bash(git status)',
        'Bash(git diff *)',
        'Bash(git log *)',
      ],
    },
  };

  await writeFile(
    join(targetDir, '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2) + '\n',
  );
}
