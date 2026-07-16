import { defineConfig } from 'tsup';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const { version: icoreVersion } = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string;
};

// Any .ts file under migrations/codemods/ compiles to its own standalone
// dist/migrations/codemods/<id>.js — this is what migrate-deps.ts's
// loadCodemod() dynamically imports at runtime from an end-user's
// installed package. No codemods exist yet (sub-project 1 and this plan
// both ship zero real entries), so this list is empty today and that's
// expected — the machinery just needs to be ready for the first one.
const here = dirname(fileURLToPath(import.meta.url));
const codemodsDir = join(here, 'migrations', 'codemods');
const codemodEntries: Record<string, string> = {};
if (existsSync(codemodsDir)) {
  for (const file of readdirSync(codemodsDir)) {
    if (file.endsWith('.ts')) {
      const id = basename(file, '.ts');
      codemodEntries[`migrations/codemods/${id}`] = join('migrations', 'codemods', file);
    }
  }
}

// Two entries with different output contracts:
//
// - `cli` is the bin script. It uses `import.meta.url` to resolve the
//   bundled `templates/` directory and pulls in `@clack/prompts` (ESM
//   only). Ship ESM only; no .d.ts.
// - `index` is the public library surface (`scaffold`, `collectOptions`,
//   `parseFlags`, option types). Ship dual ESM + CJS with .d.ts so
//   library consumers can `import` or `require` it.

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts', 'manifest/audit': 'src/manifest/audit.ts', ...codemodEntries },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: false,
    shims: true,
    splitting: false,
    define: { ICORE_OWN_VERSION: JSON.stringify(icoreVersion) },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'node20',
    outDir: 'dist',
    clean: false,
    dts: true,
    shims: true,
    splitting: false,
  },
]);
