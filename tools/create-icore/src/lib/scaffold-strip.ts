import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { stripGatewayTransport } from './scaffold-env.js';

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
  // Strip payment entry from GATEWAY_SERVICES in main.ts
  const mainTsPath = join(targetDir, 'apps/api/src/main.ts');
  try {
    const src = await readFile(mainTsPath, 'utf8');
    const next = src.replace(/\n\s*\{ name: 'payment', prefix: 'PAYMENT' \},/, '');
    await writeFile(mainTsPath, next);
  } catch {
    // ignore — main.ts may not exist in test scaffolds
  }
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

  // Strip @icore/notes-client dep from api/package.json. Also drop
  // @casl/ability: the gateway's only direct import of it lived in the notes
  // controller (`subject(...)`); the abilities infra itself consumes CASL via
  // @icore/shared, so once notes are gone the raw dep is unused (@nx/dependency-checks).
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/notes-client',
    '@casl/ability',
  ]);

  // Strip NOTES_* transport block from the gateway .env
  await stripGatewayTransport(targetDir, 'NOTES');

  // Strip notes entry from GATEWAY_SERVICES in main.ts
  const mainTsPath = join(targetDir, 'apps/api/src/main.ts');
  try {
    const src = await readFile(mainTsPath, 'utf8');
    const next = src.replace(/\n\s*\{ name: 'notes', prefix: 'NOTES' \},/, '');
    await writeFile(mainTsPath, next);
  } catch {
    // ignore — main.ts may not exist in test scaffolds
  }

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
    // The `to` paths may be either "/_dashboard/notes" (older templates) or
    // "/notes" (TanStack pathless-layout fix), so every match is path-agnostic
    // via the `\/(?:_dashboard\/)?notes` alternation — keeps pruning working
    // regardless of which route style the template ships.
    const next = src
      // shadcn: remove StickyNote from lucide import + notes Link block
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/Link>/, '')
      // antd: remove FileTextOutlined + selectedKey notes branch + notes items entry
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        /\n {4}\{\n {6}key: 'notes',\n {6}icon: <FileTextOutlined \/>,\n {6}label: <Link to="\/(?:_dashboard\/)?notes">\{t\('notes\.title'\)\}<\/Link>,\n {4}\},/,
        '',
      )
      // mui: remove NoteOutlinedIcon import + notes ListItemButton
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/ListItemButton>/,
        '',
      )
      // test stub: remove simple notes link
      .replace(/\n\s*<Link to="\/(?:_dashboard\/)?notes">[\s\S]*?<\/Link>/m, '');
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

export async function removeUnusedAuthStrategies(
  targetDir: string,
  authProvider: string,
): Promise<void> {
  const modulePath = join(targetDir, 'apps/microservices/auth/src/app/app.module.ts');

  const AUTH_BRANCH =
    /if \(provider === 'supabase'\) return makeSupabaseAuth\(cfg\);\n\s*if \(provider === 'mongodb'\) return makeMongoDbAuth\(connection, cfg\);\n\s*return makeFirebaseAuth\(cfg\);/m;

  if (authProvider === 'supabase') {
    await rm(join(targetDir, 'libs/auth-strategies/firebase'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/auth-strategies/mongodb'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-firebase',
      '@icore/firebase-admin',
      '@icore/auth-mongodb',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-firebase');
    await stripTsconfigPath(targetDir, '@icore/auth-mongodb');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{[^}]*\} from '@icore\/firebase-admin';\n/gm, '')
        .replace(/^import \{[^}]*FirebaseAuthStrategy[^}]*\} from '@icore\/auth-firebase';\n/gm, '')
        .replace(/^import \{[^}]*MongoDbAuthStrategy[^}]*\} from '@icore\/auth-mongodb';\n/gm, '')
        .replace(
          /^import \{ MongooseModule, getConnectionToken \} from '@nestjs\/mongoose';\n/gm,
          '',
        )
        .replace(/^import \{ Connection \} from 'mongoose';\n/gm, '')
        // drop the firebase and mongodb entries from the REQUIRED_ENV map
        .replace(/^ {2}firebase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}mongodb: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeFirebaseAuth[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeMongoDbAuth[\s\S]*?\n}\n/gm, '')
        // remove MongooseModule from imports
        .replace(/^ {4}MongooseModule\.forRootAsync[\s\S]*?\n {4}\}\),\n/gm, '')
        .replace(AUTH_BRANCH, 'return makeSupabaseAuth(cfg);')
        .replace(/, connection: Connection/, '')
        .replace(/, getConnectionToken\(\)/, '');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (authProvider === 'firebase') {
    await rm(join(targetDir, 'libs/auth-strategies/supabase'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/auth-strategies/mongodb'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-supabase',
      '@icore/auth-mongodb',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-supabase');
    await stripTsconfigPath(targetDir, '@icore/auth-mongodb');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/gm, '')
        .replace(/^import \{[^}]*SupabaseAuthStrategy[^}]*\} from '@icore\/auth-supabase';\n/gm, '')
        .replace(/^import \{[^}]*MongoDbAuthStrategy[^}]*\} from '@icore\/auth-mongodb';\n/gm, '')
        .replace(
          /^import \{ MongooseModule, getConnectionToken \} from '@nestjs\/mongoose';\n/gm,
          '',
        )
        .replace(/^import \{ Connection \} from 'mongoose';\n/gm, '')
        .replace(/^ {2}supabase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}mongodb: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeSupabaseAuth[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeMongoDbAuth[\s\S]*?\n}\n/gm, '')
        .replace(/^ {4}MongooseModule\.forRootAsync[\s\S]*?\n {4}\}\),\n/gm, '')
        .replace(AUTH_BRANCH, 'return makeFirebaseAuth(cfg);')
        .replace(/, connection: Connection/, '')
        .replace(/, getConnectionToken\(\)/, '');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (authProvider === 'mongodb') {
    await rm(join(targetDir, 'libs/auth-strategies/supabase'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/auth-strategies/firebase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
      '@icore/auth-supabase',
      '@icore/auth-firebase',
      '@icore/firebase-admin',
    ]);
    await stripTsconfigPath(targetDir, '@icore/auth-supabase');
    await stripTsconfigPath(targetDir, '@icore/auth-firebase');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/gm, '')
        .replace(/^import \{[^}]*SupabaseAuthStrategy[^}]*\} from '@icore\/auth-supabase';\n/gm, '')
        .replace(/^import \{[^}]*\} from '@icore\/firebase-admin';\n/gm, '')
        .replace(/^import \{[^}]*FirebaseAuthStrategy[^}]*\} from '@icore\/auth-firebase';\n/gm, '')
        .replace(/^ {2}supabase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}firebase: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeSupabaseAuth[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeFirebaseAuth[\s\S]*?\n}\n/gm, '')
        .replace(AUTH_BRANCH, 'return makeMongoDbAuth(connection, cfg);');
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

  const STORAGE_BRANCH =
    /if \(provider === 'supabase'\) return makeSupabaseStorage\(cfg\);\n\s*if \(provider === 'firebase'\) return makeFirebaseStorage\(cfg\);\n\s*if \(provider === 'mongodb'\) return makeMongoDbStorage\(connection\);\n\s*return makeCloudinaryStorage\(cfg\);/m;

  if (uploadProvider !== 'firebase') {
    await rm(join(targetDir, 'libs/storage-strategies/firebase'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      '@icore/storage-firebase',
      '@icore/firebase-admin',
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

  if (uploadProvider !== 'mongodb') {
    await rm(join(targetDir, 'libs/storage-strategies/mongodb'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
      '@icore/storage-mongodb',
    ]);
    await stripTsconfigPath(targetDir, '@icore/storage-mongodb');
  }

  try {
    let src = await readFile(modulePath, 'utf8');
    // Remove the imports + factory functions of the providers NOT chosen.
    if (uploadProvider !== 'firebase') {
      src = src
        .replace(/^import \{[^}]*\} from '@icore\/firebase-admin';\n/gm, '')
        .replace(
          /^import \{[^}]*FirebaseStorageStrategy[^}]*\} from '@icore\/storage-firebase';\n/gm,
          '',
        )
        .replace(/^ {2}firebase: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeFirebaseStorage[\s\S]*?\n}\n/gm, '');
    }
    if (uploadProvider !== 'cloudinary') {
      src = src
        .replace(/^import \{ v2 as cloudinary \} from 'cloudinary';\n/gm, '')
        .replace(
          /^import \{[^}]*CloudinaryStorageStrategy[^}]*\} from '@icore\/storage-cloudinary';\n/gm,
          '',
        )
        .replace(/\nfunction makeCloudinaryStorage[\s\S]*?\n}\n/gm, '');
    }
    if (uploadProvider !== 'supabase') {
      src = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/gm, '')
        .replace(
          /^import \{[^}]*SupabaseStorageStrategy[^}]*\} from '@icore\/storage-supabase';\n/gm,
          '',
        )
        .replace(/\nfunction makeSupabaseStorage[\s\S]*?\n}\n/gm, '');
    }
    if (uploadProvider !== 'mongodb') {
      src = src
        .replace(
          /^import \{[^}]*MongoDbStorageStrategy[^}]*\} from '@icore\/storage-mongodb';\n/gm,
          '',
        )
        .replace(
          /^import \{ MongooseModule, getConnectionToken \} from '@nestjs\/mongoose';\n/gm,
          '',
        )
        .replace(/^import \{ Connection \} from 'mongoose';\n/gm, '')
        .replace(/^ {2}mongodb: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeMongoDbStorage[\s\S]*?\n}\n/gm, '')
        .replace(/^ {4}MongooseModule\.forRootAsync[\s\S]*?\n {4}\}\),\n/gm, '');
    }

    // Collapse the 4-line provider branch to a single return for the chosen one.
    const chosenReturn =
      uploadProvider === 'mongodb'
        ? `return makeMongoDbStorage(connection);`
        : `return make${uploadProvider.charAt(0).toUpperCase() + uploadProvider.slice(1)}Storage(cfg);`;
    src = src.replace(STORAGE_BRANCH, chosenReturn);
    if (uploadProvider !== 'mongodb') {
      src = src.replace(/, connection: Connection/, '').replace(/, getConnectionToken\(\)/, '');
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

  const DB_BRANCH =
    /if \(provider === 'supabase'\) return makeSupabaseDB\(cfg\);\n\s*if \(provider === 'mongodb'\) return makeMongoDb\(connection\);\n\s*return makeFirestoreDB\(cfg\);/m;

  if (dbProvider === 'supabase') {
    await rm(join(targetDir, 'libs/db-strategies/firestore'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/db-strategies/mongodb'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-firestore',
      '@icore/firebase-admin',
      '@icore/db-mongodb',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-firestore');
    await stripTsconfigPath(targetDir, '@icore/db-mongodb');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{[^}]*\} from '@icore\/firebase-admin';\n/gm, '')
        .replace(/^import \{[^}]*FirestoreDBStrategy[^}]*\} from '@icore\/db-firestore';\n/gm, '')
        .replace(/^import \{[^}]*MongoDbDBStrategy[^}]*\} from '@icore\/db-mongodb';\n/gm, '')
        .replace(
          /^import \{ MongooseModule, getConnectionToken \} from '@nestjs\/mongoose';\n/gm,
          '',
        )
        .replace(/^import \{ Connection \} from 'mongoose';\n/gm, '')
        // drop the firestore + firebase + mongodb entries from the REQUIRED_ENV map
        .replace(/^ {2}firestore: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}firebase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}mongodb: \[[^\]]*\],\n/gm, '')
        // drop factory functions
        .replace(/\nfunction makeFirestoreDB[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeMongoDb[\s\S]*?\n}\n/gm, '')
        .replace(/^ {4}MongooseModule\.forRootAsync[\s\S]*?\n {4}\}\),\n/gm, '')
        // collapse the provider branch to an unconditional supabase return
        .replace(DB_BRANCH, 'return makeSupabaseDB(cfg);')
        .replace(/, connection: Connection/, '')
        .replace(/, getConnectionToken\(\)/, '');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (dbProvider === 'firebase') {
    await rm(join(targetDir, 'libs/db-strategies/supabase'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/db-strategies/mongodb'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-supabase',
      '@icore/db-mongodb',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-supabase');
    await stripTsconfigPath(targetDir, '@icore/db-mongodb');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/gm, '')
        .replace(/^import \{[^}]*SupabaseDBStrategy[^}]*\} from '@icore\/db-supabase';\n/gm, '')
        .replace(/^import \{[^}]*MongoDbDBStrategy[^}]*\} from '@icore\/db-mongodb';\n/gm, '')
        .replace(
          /^import \{ MongooseModule, getConnectionToken \} from '@nestjs\/mongoose';\n/gm,
          '',
        )
        .replace(/^import \{ Connection \} from 'mongoose';\n/gm, '')
        .replace(/^ {2}supabase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}mongodb: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeSupabaseDB[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeMongoDb[\s\S]*?\n}\n/gm, '')
        .replace(/^ {4}MongooseModule\.forRootAsync[\s\S]*?\n {4}\}\),\n/gm, '')
        .replace(/\nfunction requireEnv[\s\S]*?\n}\n/gm, '')
        // collapse the provider branch to an unconditional firestore return
        .replace(DB_BRANCH, 'return makeFirestoreDB(cfg);')
        .replace(/, connection: Connection/, '')
        .replace(/, getConnectionToken\(\)/, '');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }

  if (dbProvider === 'mongodb') {
    await rm(join(targetDir, 'libs/db-strategies/supabase'), { recursive: true, force: true });
    await rm(join(targetDir, 'libs/db-strategies/firestore'), { recursive: true, force: true });
    await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
      '@icore/db-supabase',
      '@icore/db-firestore',
      '@icore/firebase-admin',
    ]);
    await stripTsconfigPath(targetDir, '@icore/db-supabase');
    await stripTsconfigPath(targetDir, '@icore/db-firestore');
    try {
      const src = await readFile(modulePath, 'utf8');
      const next = src
        .replace(/^import \{ createClient \} from '@supabase\/supabase-js';\n/gm, '')
        .replace(/^import \{[^}]*SupabaseDBStrategy[^}]*\} from '@icore\/db-supabase';\n/gm, '')
        .replace(/^import \{[^}]*\} from '@icore\/firebase-admin';\n/gm, '')
        .replace(/^import \{[^}]*FirestoreDBStrategy[^}]*\} from '@icore\/db-firestore';\n/gm, '')
        .replace(/^ {2}supabase: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}firestore: \[[^\]]*\],\n/gm, '')
        .replace(/^ {2}firebase: \[[^\]]*\],\n/gm, '')
        .replace(/\nfunction makeSupabaseDB[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction makeFirestoreDB[\s\S]*?\n}\n/gm, '')
        .replace(/\nfunction requireEnv[\s\S]*?\n}\n/gm, '')
        .replace(DB_BRANCH, 'return makeMongoDb(connection);');
      await writeFile(modulePath, next);
    } catch {
      // ignore
    }
  }
}

/**
 * Deletes the shared `@icore/firebase-admin` init lib and its tsconfig alias.
 * Called only when no microservice uses the Firebase provider — the per-MS
 * strategy pruning already removes the import + dep from each service.
 */
export async function removeFirebaseAdminLib(targetDir: string): Promise<void> {
  await rm(join(targetDir, 'libs/firebase-admin'), { recursive: true, force: true });
  await stripTsconfigPath(targetDir, '@icore/firebase-admin');
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
