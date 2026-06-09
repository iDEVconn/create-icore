import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { StorageProvider } from './types.js';
import { MANIFEST } from './index.js';

const STORAGE_PROVIDER_FILE = 'apps/microservices/upload/src/app/storage.provider.ts';
const UPLOAD_PKG = 'apps/microservices/upload/package.json';
const ENV_PATH = 'apps/microservices/upload/.env';

export async function writeStorageProvider(
  targetDir: string,
  provider: StorageProvider,
): Promise<void> {
  const nestModule = MANIFEST.storage[provider].nestModule;
  if (!nestModule) throw new Error(`storage provider ${provider} has no nestModule in manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const StorageProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, STORAGE_PROVIDER_FILE), content);
}

async function stripPkgKeys(path: string, drop: (k: string) => boolean): Promise<void> {
  try {
    const pkg = JSON.parse(await readFile(path, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const deps = pkg[field];
      if (!deps) continue;
      for (const k of Object.keys(deps)) if (drop(k)) delete deps[k];
    }
    await writeFile(path, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // pkg may be absent in partial fixtures
  }
}

async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
  const path = join(targetDir, 'tsconfig.base.json');
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      compilerOptions?: { paths?: Record<string, unknown> };
    };
    const paths = parsed.compilerOptions?.paths;
    if (paths) for (const a of aliases) delete paths[a];
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // tsconfig may be absent in partial fixtures
  }
}

/** Manifest-driven removal of every storage provider NOT chosen: lib dirs, their
 *  workspace alias (tsconfig + upload package.json), and their raw SDK deps from
 *  the upload package.json. Replaces the regex `removeUnusedStorageStrategies`. */
export async function cleanupUnusedStorage(
  targetDir: string,
  chosen: StorageProvider,
): Promise<void> {
  const providers = Object.keys(MANIFEST.storage) as StorageProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.storage[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    const aliases = Object.keys(unit.tsPaths);
    const rawDeps = Object.keys(unit.deps);
    const dropKeys = new Set([...aliases, ...rawDeps]);
    await stripPkgKeys(join(targetDir, UPLOAD_PKG), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, aliases);
  }
}
