import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

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

/** Notes' CLIENT-side source edits to files that survive (LayoutSider nav + i18n
 *  keys). Temporary until the client phase replaces it with a generated nav.config.
 *  Dir removals + gateway/transport cleanup live in cleanupUnusedFeatures. */
export async function removeNotesClientTail(targetDir: string): Promise<void> {
  const siderPath = join(targetDir, 'apps/client/src/components/layout/LayoutSider.tsx');
  try {
    const src = await readFile(siderPath, 'utf8');
    const next = src
      .replace(', StickyNote', '')
      .replace(/\n {8}<Link\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/Link>/, '')
      .replace(', FileTextOutlined', '')
      .replace(
        "const selectedKey = pathname.includes('/notes')\n    ? 'notes'\n    : pathname.includes('/profile')",
        "const selectedKey = pathname.includes('/profile')",
      )
      .replace(
        /\n {4}\{\n {6}key: 'notes',\n {6}icon: <FileTextOutlined \/>,\n {6}label: <Link to="\/(?:_dashboard\/)?notes">\{t\('notes\.title'\)\}<\/Link>,\n {4}\},/,
        '',
      )
      .replace("import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';\n", '')
      .replace(
        /\n {8}<ListItemButton\n {10}component=\{Link\}\n {10}to="\/(?:_dashboard\/)?notes"[\s\S]*?<\/ListItemButton>/,
        '',
      )
      .replace(/\n\s*<Link to="\/(?:_dashboard\/)?notes">[\s\S]*?<\/Link>/m, '');
    await writeFile(siderPath, next);
  } catch {
    // ignore
  }
  const keysPath = join(targetDir, 'libs/template-shared/src/lib/i18n/keys.ts');
  try {
    const src = await readFile(keysPath, 'utf8');
    const next = src.replace(/^\s{4}notes: \{\n(?:\s+.*\n)*?\s{4}\},\n/m, '');
    await writeFile(keysPath, next);
  } catch {
    // ignore
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
  // The lib is gone — strip the now-orphaned workspace dep from every MS
  // package.json that declares it, or the generated `yarn install` breaks.
  await stripDeps(join(targetDir, 'apps/microservices/auth/package.json'), [
    '@icore/firebase-admin',
  ]);
  await stripDeps(join(targetDir, 'apps/microservices/upload/package.json'), [
    '@icore/firebase-admin',
  ]);
  await stripDeps(join(targetDir, 'apps/microservices/notes/package.json'), [
    '@icore/firebase-admin',
  ]);
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
