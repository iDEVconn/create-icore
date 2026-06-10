import { defineConfig } from 'tsup';

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
    entry: { cli: 'src/cli.ts', 'manifest/audit': 'src/manifest/audit.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    dts: false,
    shims: true,
    splitting: false,
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
