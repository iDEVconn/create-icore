import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// removeStrategiesLib (scaffold-strip.ts) deletes libs/shared/src/strategies, transport.ts and
// local-transport.ts from all-none projects (auth, upload, db, payment, ai = none). Gateway files
// that ship in such a project must not import a symbol that only those files export, or the
// gateway stops typechecking (TS2305) in every api mode.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SHARED = join(repoRoot, 'libs/shared/src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__') walk(p, out);
    } else if (p.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(p)) out.push(p);
  }
  return out;
}

function exportedSymbols(files: string[]): Set<string> {
  const out = new Set<string>();
  const re =
    /export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|const|function|enum|let)\s+(\w+)/g;
  for (const f of files)
    for (const m of readFileSync(f, 'utf8').matchAll(re)) out.add(m[1] as string);
  return out;
}

const STRIPPED_SYMBOLS = exportedSymbols([
  ...walk(join(SHARED, 'strategies')),
  join(SHARED, 'transport.ts'),
  join(SHARED, 'local-transport.ts'),
]);

/** Gateway files that ship in an all-none project (auth=none, no feature, any api mode). */
const NEUTRAL_FILES = [
  ...walk(join(repoRoot, 'apps/api/src/app/http')),
  ...walk(join(repoRoot, 'apps/api/src/app/graphql')).filter(
    // Generated per project by wireApi.
    (f) => !/api-surface(s\.module|-resolvers)\.ts$/.test(f),
  ),
  join(repoRoot, 'apps/api/src/main.ts'),
];

function sharedImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@icore\/shared'/g)) {
    for (const part of (m[1] as string).split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (name) out.push(name);
    }
  }
  return out;
}

describe('gateway files shipped in all-none projects', () => {
  it('finds the stripped symbols (sanity)', () => {
    expect(STRIPPED_SYMBOLS.has('VerifiedToken')).toBe(true);
    expect(STRIPPED_SYMBOLS.has('AuthStrategy')).toBe(true);
    expect(STRIPPED_SYMBOLS.has('buildTransport')).toBe(true);
  });

  it.each(NEUTRAL_FILES.map((f) => [relative(repoRoot, f), f]))(
    '%s imports nothing that removeStrategiesLib deletes',
    (_rel, file) => {
      const offending = sharedImports(readFileSync(file, 'utf8')).filter((s) =>
        STRIPPED_SYMBOLS.has(s),
      );
      expect(offending).toEqual([]);
    },
  );
});
