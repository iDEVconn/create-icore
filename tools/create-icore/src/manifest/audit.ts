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

async function rootDeps(dir: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(dir, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
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

  const deps = await rootDeps(dir);
  for (const forbidden of opts.forbiddenDeps ?? []) {
    if (deps.has(forbidden)) {
      violations.push({
        kind: 'forbidden-dep',
        detail: `root package.json keeps forbidden dep ${forbidden}`,
      });
    }
  }

  return violations;
}
