import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DbProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';

const DB_PROVIDER_FILE = 'apps/microservices/notes/src/app/db.provider.ts';
const NOTES_PKG = 'apps/microservices/notes/package.json';
const ENV_PATH = 'apps/microservices/notes/.env';

export async function writeDbProvider(targetDir: string, provider: DbProvider): Promise<void> {
  const nestModule = MANIFEST.db[provider].nestModule;
  if (!nestModule) throw new Error(`db provider ${provider} has no nestModule in manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const DbProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, DB_PROVIDER_FILE), content);
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

/** Manifest-driven removal of every DB provider NOT chosen: lib dirs (firebase→firestore
 *  handled by the manifest libDirs), their workspace alias + raw SDK deps from the notes
 *  package.json + tsconfig. Replaces the regex `removeUnusedDbStrategies`. */
export async function cleanupUnusedDb(targetDir: string, chosen: DbProvider): Promise<void> {
  const providers = Object.keys(MANIFEST.db) as DbProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.db[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    const aliases = Object.keys(unit.tsPaths);
    const rawDeps = Object.keys(unit.deps);
    const dropKeys = new Set([...aliases, ...rawDeps]);
    await stripPkgKeys(join(targetDir, NOTES_PKG), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, aliases);
  }
}
