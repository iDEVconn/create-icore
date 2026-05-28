import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts', index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  shims: true,
  splitting: false,
});
