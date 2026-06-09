import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuthProvider } from '../lib/options.js';
import { MANIFEST } from './index.js';

const AUTH_PROVIDER_FILE = 'apps/microservices/auth/src/app/auth.provider.ts';
const ENV_PATH = 'apps/microservices/auth/.env';

/** Write apps/microservices/auth/src/app/auth.provider.ts wiring the chosen module. */
export async function writeAuthProvider(targetDir: string, provider: AuthProvider): Promise<void> {
  const nestModule = MANIFEST.auth[provider].nestModule;
  if (!nestModule) throw new Error(`auth provider "${provider}" has no nestModule in the manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${ENV_PATH}';\n\n` +
    `export const AuthProviderModule = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, AUTH_PROVIDER_FILE), content);
}

async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
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
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } };
    const paths = parsed.compilerOptions?.paths;
    if (paths) for (const a of aliases) delete paths[a];
    await writeFile(path, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // tsconfig may be absent in partial fixtures
  }
}

/** Manifest-driven removal of every auth provider that was NOT chosen: lib dirs,
 *  their workspace deps + tsconfig aliases, and their app-level controller tests.
 *  Replaces the old regex `removeUnusedAuthStrategies` — no source surgery. */
export async function cleanupUnusedAuth(targetDir: string, chosen: AuthProvider): Promise<void> {
  const providers = Object.keys(MANIFEST.auth) as AuthProvider[];
  for (const p of providers) {
    if (p === chosen) continue;
    const unit = MANIFEST.auth[p];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    for (const t of unit.appTests ?? []) await rm(join(targetDir, t), { force: true });
    const aliases = Object.keys(unit.tsPaths);
    await stripJsonKeys(join(targetDir, 'apps/microservices/auth/package.json'), (k) =>
      aliases.includes(k),
    );
    await stripTsconfigKeys(targetDir, aliases);
  }
}
