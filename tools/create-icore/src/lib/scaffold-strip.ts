import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isEnoent(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
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

async function stripTsconfigPath(targetDir: string, alias: string): Promise<void> {
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  let src: string;
  try {
    src = await readFile(tsconfigPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return; // tsconfig may not exist in test scaffolds
    throw err;
  }
  // Try pretty-printed regex first (preserves formatting for real tsconfig files)
  const escaped = alias.replace(/[@/]/g, (c) => (c === '@' ? '@' : '\\/'));
  let pretty = src.replace(new RegExp(`^\\s*"${escaped}": \\[[^\\]]*\\],?\\n`, 'm'), '');
  if (pretty !== src) {
    // Clean up any trailing commas left by removing a line (e.g., after removing
    // a path entry, the previous entry's comma is now dangling before the closing brace)
    pretty = pretty.replace(/,(\s*[\]}])/g, '$1');
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

export async function removeStrategiesLib(targetDir: string): Promise<void> {
  await rm(join(targetDir, 'libs/shared/src/strategies'), { recursive: true, force: true });
  await rm(join(targetDir, 'libs/shared/src/testing.ts'), { force: true });
  // transport.ts only wires MS client options — dead when no microservices exist
  await rm(join(targetDir, 'libs/shared/src/transport.ts'), { force: true });
  await rm(join(targetDir, 'libs/shared/src/__tests__/transport.unit.test.ts'), { force: true });

  const indexPath = join(targetDir, 'libs/shared/src/index.ts');
  try {
    const src = await readFile(indexPath, 'utf8');
    await writeFile(
      indexPath,
      src
        .replace(/^export \* from '\.\/strategies';\n/m, '')
        .replace(/^export \* from '\.\/transport';\n?/m, ''),
    );
  } catch {
    // ignore — may be absent in test scaffolds
  }

  const pkgPath = join(targetDir, 'libs/shared/package.json');
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      exports?: Record<string, unknown>;
      dependencies?: Record<string, string>;
    };
    if (pkg.exports) delete pkg.exports['./testing'];
    if (pkg.dependencies) delete pkg.dependencies['@nestjs/microservices'];
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // ignore — may be absent in test scaffolds
  }
}

export async function removeUploadStack(targetDir: string): Promise<void> {
  const paths = [
    'apps/microservices/upload',
    'apps/microservices/upload-e2e',
    'libs/storage-strategies',
    'libs/upload-client',
    'apps/api/src/app/storage',
    'Dockerfile.ms-upload',
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

  // Strip upload service from docker-compose.yml
  const uploadComposePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(uploadComposePath, 'utf8');
    const next = compose
      .replace(/\n {2}upload:[\s\S]+?(?=\n {2}\w|\nnetworks:)/m, '\n')
      .replace(/\n {6}upload:\n {8}condition: service_started/g, '')
      .replace(/\n {6}UPLOAD_TRANSPORT:[^\n]*/g, '')
      .replace(/\n {6}UPLOAD_REDIS_URL:[^\n]*/g, '');
    await writeFile(uploadComposePath, next);
  } catch {
    // ignore
  }
}

/** Recursively collect every .ts/.tsx file under a dir (node_modules skipped). */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      found.push(...(await collectSourceFiles(p)));
    } else if (e.isFile() && /\.tsx?$/.test(e.name)) {
      found.push(p);
    }
  }
  return found;
}

/** True when any .ts/.tsx file under `srcDir` imports `dep` (or a `dep/...` subpath). */
async function dirImportsDep(srcDir: string, dep: string): Promise<boolean> {
  const escaped = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `from ['"]${escaped}(?:/[^'"]*)?['"]|require\\(['"]${escaped}(?:/[^'"]*)?['"]\\)`,
  );
  for (const f of await collectSourceFiles(srcDir)) {
    try {
      if (re.test(await readFile(f, 'utf8'))) return true;
    } catch {
      // ignore unreadable files
    }
  }
  return false;
}

/**
 * Drops express + @types/express from apps/api/package.json when no gateway
 * source file imports express directly (happens when auth=none strips all
 * feature controllers that typed request/response objects from express).
 */
export async function pruneApiExpressDep(targetDir: string): Promise<void> {
  const apiSrc = join(targetDir, 'apps/api/src');
  const files = await collectSourceFiles(apiSrc);
  for (const f of files) {
    try {
      const src = await readFile(f, 'utf8');
      if (/from ['"]express['"]/.test(src) || /require\(['"]express['"]\)/.test(src)) {
        return;
      }
    } catch {
      // ignore unreadable files
    }
  }
  await stripDeps(join(targetDir, 'apps/api/package.json'), ['express', '@types/express']);
}

/**
 * Drops @casl/ability, @casl/react, and @icore/shared from libs that no longer
 * import them after auth=none strips the abilities modules.
 */
export async function pruneUnusedLibDeps(targetDir: string): Promise<void> {
  const checks: { lib: string; dep: string }[] = [
    { lib: 'libs/shared', dep: '@casl/ability' },
    { lib: 'libs/template-shared', dep: '@casl/react' },
    { lib: 'libs/template-shared', dep: '@icore/shared' },
  ];
  for (const { lib, dep } of checks) {
    const used = await dirImportsDep(join(targetDir, lib, 'src'), dep);
    if (!used) await stripDeps(join(targetDir, lib, 'package.json'), [dep]);
  }
}
