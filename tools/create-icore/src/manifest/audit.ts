import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Violation {
  kind: 'import-of-absent-lib' | 'forbidden-dep';
  detail: string;
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.nx']);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) await walk(join(dir, e.name), out);
    } else if (/\.(ts|tsx|mjs)$/.test(e.name)) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

async function tsconfigAliases(dir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(dir, 'tsconfig.base.json'), 'utf8');
    const aliases = new Set<string>();
    // `/`-subpath aliases (e.g. @icore/shared/testing) are intentionally excluded here, symmetric with ICORE_IMPORT.
    // The char class allows `.` so alias keys like `@icore/package.json` are captured whole (kept symmetric with the import side).
    for (const m of raw.matchAll(/"(@icore\/[a-z0-9.-]+)"\s*:/g)) aliases.add(m[1]);
    return aliases;
  } catch {
    return new Set();
  }
}

interface Blueprint {
  authProvider?: string;
  dbProvider?: string;
  upload?: string;
}

/** A provider's raw marker dep(s) that must be ABSENT when the provider is unchosen. */
const PROVIDER_SDKS: Record<string, string[]> = {
  supabase: ['@supabase/supabase-js'],
  cloudinary: ['cloudinary'],
  mongodb: ['mongoose'],
  firebase: ['firebase-admin', '@icore/firebase-admin'],
};

async function readBlueprint(dir: string): Promise<Blueprint | null> {
  try {
    return JSON.parse(await readFile(join(dir, 'blueprint.json'), 'utf8')) as Blueprint;
  } catch {
    return null;
  }
}

/** Forbidden raw SDKs derived from the blueprint: a provider's SDK is forbidden
 *  iff that provider appears in none of auth/db/upload. */
function forbiddenFromBlueprint(bp: Blueprint): string[] {
  const chosen = new Set([bp.authProvider, bp.dbProvider, bp.upload].filter(Boolean));
  const forbidden: string[] = [];
  for (const [provider, sdks] of Object.entries(PROVIDER_SDKS)) {
    if (!chosen.has(provider)) forbidden.push(...sdks);
  }
  return forbidden;
}

/** Every package.json under the project (root + apps/**), skipping node_modules. */
async function allPackageJsons(dir: string): Promise<string[]> {
  const out: string[] = [];
  const root = join(dir, 'package.json');
  out.push(root);
  async function walk(d: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) await walk(join(d, e.name));
      } else if (e.name === 'package.json') {
        out.push(join(d, e.name));
      }
    }
  }
  await walk(join(dir, 'apps'));
  return out;
}

async function depKeys(pkgPath: string): Promise<Set<string>> {
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]);
  } catch {
    return new Set();
  }
}

// Matches static `from '…'`/`from "…"` and dynamic `import('…')` of an @icore package.
// NOTE: `/`-subpath aliases (e.g. @icore/shared/testing) are intentionally not captured here;
// the tsconfig alias regex is symmetric on this, so it produces no false positive. The `.` in the
// char class keeps `@icore/package.json`-style aliases captured whole, symmetric with tsconfigAliases.
const ICORE_IMPORT = /(?:from|import\()\s*['"](@icore\/[a-z0-9.-]+)/g;

export async function auditProject(
  dir: string,
  opts: { forbiddenDeps?: string[] } = {},
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const aliases = await tsconfigAliases(dir);

  for (const file of await walk(dir)) {
    const src = await readFile(file, 'utf8');
    for (const m of src.matchAll(ICORE_IMPORT)) {
      const alias = m[1];
      if (!aliases.has(alias)) {
        violations.push({
          kind: 'import-of-absent-lib',
          detail: `${file} imports ${alias} (no tsconfig path → lib absent)`,
        });
      }
    }
  }

  // Forbidden raw SDK deps: explicit (opts) ∪ derived from blueprint.json.
  const bp = await readBlueprint(dir);
  const forbidden = new Set<string>([
    ...(opts.forbiddenDeps ?? []),
    ...(bp ? forbiddenFromBlueprint(bp) : []),
  ]);
  if (forbidden.size > 0) {
    for (const pkgPath of await allPackageJsons(dir)) {
      const deps = await depKeys(pkgPath);
      for (const f of forbidden) {
        if (deps.has(f)) {
          violations.push({
            kind: 'forbidden-dep',
            detail: `${pkgPath} keeps forbidden dep ${f}`,
          });
        }
      }
    }
  }

  return violations;
}
