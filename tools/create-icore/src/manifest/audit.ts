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
    const parsed = JSON.parse(raw) as { compilerOptions?: { paths?: Record<string, unknown> } };
    return new Set(Object.keys(parsed.compilerOptions?.paths ?? {}));
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

const ICORE_IMPORT = /from '(@icore\/[a-z0-9-]+)'/g;

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
