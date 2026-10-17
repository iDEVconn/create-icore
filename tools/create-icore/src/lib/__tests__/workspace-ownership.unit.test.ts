import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolveRepoRoot();

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.nx', 'coverage', 'tmp', '__tests__', 'e2e']);

/** Node built-ins commonly required without the `node:` prefix in webpack configs. */
const NODE_BUILTINS = new Set(['path', 'fs', 'crypto', 'url', 'util', 'os', 'stream', 'buffer']);

const CONFIG_GLOBS = [
  'vite.config.mts',
  'vite.config.ts',
  'vitest.config.mts',
  'vitest.config.ts',
  'webpack.config.js',
  'webpack.config.ts',
  'eslint.config.mjs',
  'jest.config.cts',
  'jest.config.ts',
];

function resolveRepoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
}

const version = (spec: string): string => spec.replace(/^[\^~]/, '');

function readRootCatalog(): Record<string, string> {
  const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return { ...root.dependencies, ...root.devDependencies };
}

function findWorkspaceRoots(): string[] {
  const roots: string[] = [];
  function walk(dir: string, depth: number): void {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      roots.push(dir);
      return;
    }
    if (depth > 6) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORE_DIRS.has(name) || name.startsWith('.')) continue;
      const full = join(dir, name);
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1);
      } catch {
        // ignore
      }
    }
  }
  for (const base of ['apps', 'libs']) {
    const baseDir = join(repoRoot, base);
    if (!existsSync(baseDir)) continue;
    for (const name of readdirSync(baseDir)) {
      if (IGNORE_DIRS.has(name) || name.endsWith('-e2e')) continue;
      walk(join(baseDir, name), 0);
    }
  }
  return roots.sort();
}

function packageNameFromImport(spec: string): string | null {
  if (
    !spec ||
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('node:') ||
    spec.startsWith('@/') ||
    spec.startsWith('virtual:')
  ) {
    return null;
  }
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return spec;
  }
  return spec.split('/')[0] ?? null;
}

function collectImportsFromSource(source: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      const spec = m[1];
      if (!spec || spec.includes('\n')) continue;
      const before = source.slice(Math.max(0, m.index - 24), m.index);
      if (/import\s+type\s/.test(before) && spec === 'express') continue;
      if (spec === '@icore/package.json') continue;
      const pkg = packageNameFromImport(spec);
      if (!pkg || NODE_BUILTINS.has(pkg)) continue;
      found.add(pkg);
    }
  }
  return found;
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (IGNORE_DIRS.has(name)) continue;
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full);
      else if (/\.(tsx?|mts?|jsx?|mjs|cjs)$/.test(name)) out.push(full);
    }
  }
  for (const cfg of CONFIG_GLOBS) {
    const p = join(dir, cfg);
    if (existsSync(p)) out.push(p);
  }
  const src = join(dir, 'src');
  if (existsSync(src)) walk(src);
  return out;
}

describe('template workspace manifests own their imports', () => {
  const catalog = readRootCatalog();

  it('every workspace declares config and source imports (PnP ownership)', () => {
    const violations: string[] = [];

    for (const wsRoot of findWorkspaceRoots()) {
      const pkgPath = join(wsRoot, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        name?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const selfName = pkg.name;
      const deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };
      const direct = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const file of collectFiles(wsRoot)) {
        const relFile = relative(wsRoot, file);
        const isConfig = CONFIG_GLOBS.some((c) => relFile === c || relFile.endsWith(c));
        let source: string;
        try {
          source = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        for (const imp of collectImportsFromSource(source)) {
          if (selfName && imp === selfName) continue;
          const declared = deps[imp];
          if (!declared) {
            violations.push(
              `${relative(repoRoot, wsRoot)}: ${relFile} imports "${imp}" (undeclared)`,
            );
            continue;
          }
          if (isConfig && !direct[imp]) {
            violations.push(
              `${relative(repoRoot, wsRoot)}: ${relFile} imports "${imp}" (config must use dependencies/devDependencies, not peer-only)`,
            );
          }
          const rootSpec = catalog[imp];
          if (rootSpec && version(declared) !== version(rootSpec)) {
            violations.push(
              `${relative(repoRoot, wsRoot)}: "${imp}" is ${declared} but root catalog has ${rootSpec}`,
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
