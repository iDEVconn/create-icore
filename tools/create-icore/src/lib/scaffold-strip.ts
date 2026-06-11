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

export async function removeAuthStack(targetDir: string): Promise<void> {
  // Delete dirs and files
  const rmPaths = [
    'apps/microservices/auth',
    'libs/auth-strategies',
    'libs/auth-client',
    'Dockerfile.ms-auth',
    'apps/api/src/app/auth',
    'apps/api/src/app/profile',
    'apps/api/src/app/abilities',
    'apps/client/src/components/auth',
    'apps/client/src/routes/login.tsx',
    'apps/client/src/routes/auth.callback.tsx',
    'apps/client/src/routes/auth.oauth.callback.tsx',
    'apps/client/src/routes/_dashboard/profile.tsx',
  ];
  for (const p of rmPaths) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }

  // Strip AuthModule, ProfileModule, AbilitiesModule from gateway app.module.ts
  const appModulePath = join(targetDir, 'apps/api/src/app/app.module.ts');
  try {
    const src = await readFile(appModulePath, 'utf8');
    const next = src
      .replace(/^import \{ AuthModule \} from '\.\/auth\/auth\.module';\n/m, '')
      .replace(/^import \{ ProfileModule \} from '\.\/profile\/profile\.module';\n/m, '')
      .replace(/^import \{ AbilitiesModule \} from '\.\/abilities\/abilities\.module';\n/m, '')
      .replace(/\bAuthModule,\s*/g, '')
      .replace(/,\s*AuthModule\b/g, '')
      .replace(/\bProfileModule,\s*/g, '')
      .replace(/,\s*ProfileModule\b/g, '')
      .replace(/\bAbilitiesModule,\s*/g, '')
      .replace(/,\s*AbilitiesModule\b/g, '');
    await writeFile(appModulePath, next);
  } catch {
    // ignore — may be absent in test scaffolds
  }

  // Strip beforeLoad auth guard from client _dashboard.tsx
  const dashboardPath = join(targetDir, 'apps/client/src/routes/_dashboard.tsx');
  try {
    const src = await readFile(dashboardPath, 'utf8');
    const next = src
      .replace(/^import \{ useAuthStore \} from '@icore\/template-shared';\n/m, '')
      .replace(/, redirect/g, '')
      .replace(/\n {2}beforeLoad: \(\) => \{[\s\S]*?\n {2}\},/m, '');
    await writeFile(dashboardPath, next);
  } catch {
    // ignore — may be absent in test scaffolds
  }

  // Strip auth tsconfig aliases
  for (const alias of [
    '@icore/auth-client',
    '@icore/auth-supabase',
    '@icore/auth-firebase',
    '@icore/auth-mongodb',
  ]) {
    await stripTsconfigPath(targetDir, alias);
  }

  // Strip @icore/auth-client from gateway package.json
  await stripDeps(join(targetDir, 'apps/api/package.json'), ['@icore/auth-client']);

  // Strip AUTH_* transport vars from gateway .env
  const gatewayEnv = join(targetDir, 'apps/api/.env');
  try {
    const env = await readFile(gatewayEnv, 'utf8');
    const next = env
      .split('\n')
      .filter((line) => !line.startsWith('AUTH_') && !line.startsWith('# AUTH_'))
      .join('\n');
    await writeFile(gatewayEnv, next);
  } catch {
    // ignore
  }

  // Strip auth service from docker-compose.yml
  const composePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(composePath, 'utf8');
    const next = compose
      .replace(/\n {2}auth:[\s\S]+?(?=\n {2}\w|\nnetworks:)/m, '\n')
      .replace(/\n {6}auth:\n {8}condition: service_started/g, '')
      .replace(/\n {6}AUTH_TRANSPORT:[^\n]*/g, '')
      .replace(/\n {6}AUTH_REDIS_URL:[^\n]*/g, '');
    await writeFile(composePath, next);
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
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/upload-client',
    '@types/multer',
  ]);
}
