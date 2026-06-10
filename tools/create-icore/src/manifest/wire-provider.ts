import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Unit } from './types.js';

/** Per-axis wiring config: which manifest section + where the generated files live. */
export interface AxisWiring {
  /** MANIFEST.auth | MANIFEST.storage | MANIFEST.db (provider key → Unit). */
  section: Record<string, Unit>;
  /** Relative path of the generated `<svc>.provider.ts`. */
  providerFile: string;
  /** Exported const name, e.g. 'AuthProviderModule'. */
  exportConst: string;
  /** Relative path of the microservice package.json to prune. */
  msPackageJson: string;
  /** ENV_PATH literal baked into the generated provider file. */
  envPath: string;
}

/** Write the `<svc>.provider.ts` wiring the chosen provider's DynamicModule. */
export async function writeProvider(
  targetDir: string,
  axis: AxisWiring,
  provider: string,
): Promise<void> {
  const nestModule = axis.section[provider]?.nestModule;
  if (!nestModule) throw new Error(`provider "${provider}" has no nestModule in the manifest`);
  const { importFrom, symbol } = nestModule;
  const content =
    `import { ${symbol} } from '${importFrom}';\n\n` +
    `const ENV_PATH = '${axis.envPath}';\n\n` +
    `export const ${axis.exportConst} = ${symbol}.forRoot(ENV_PATH);\n`;
  await writeFile(join(targetDir, axis.providerFile), content);
}

export async function stripJsonKeys(path: string, drop: (k: string) => boolean): Promise<void> {
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

export async function stripTsconfigKeys(targetDir: string, aliases: string[]): Promise<void> {
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

/**
 * Remove every provider in the axis that was NOT chosen: its lib dirs, app-level
 * tests, workspace alias + raw SDK deps (from the MS package.json), and tsconfig
 * path aliases. Stripping `tsPaths ∪ deps` keeps the chosen provider's own deps
 * while pruning the rest — no source surgery.
 *
 * NOTE: the shared `@icore/firebase-admin` dep is owned by `removeFirebaseAdminLib`
 * (gated on whether ANY axis uses firebase), not here. A non-db axis using firebase
 * can leave an unused `@icore/firebase-admin` in the notes package.json — a separate,
 * harmless concern not addressed by this generic cleanup.
 */
export async function cleanupUnusedAxis(
  targetDir: string,
  axis: AxisWiring,
  chosen: string,
): Promise<void> {
  for (const provider of Object.keys(axis.section)) {
    if (provider === chosen) continue;
    const unit = axis.section[provider];
    for (const dir of unit.libDirs)
      await rm(join(targetDir, dir), { recursive: true, force: true });
    for (const t of unit.appTests ?? []) await rm(join(targetDir, t), { force: true });
    const dropKeys = new Set([...Object.keys(unit.tsPaths), ...Object.keys(unit.deps)]);
    await stripJsonKeys(join(targetDir, axis.msPackageJson), (k) => dropKeys.has(k));
    await stripTsconfigKeys(targetDir, Object.keys(unit.tsPaths));
  }
}
