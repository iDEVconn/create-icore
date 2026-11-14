import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/worker',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    // `cloudflare:workers` only exists inside workerd.
    alias: {
      'cloudflare:workers': `${import.meta.dirname}/src/testing/cloudflare-workers.stub.ts`,
    },
  },
  test: {
    name: 'worker',
    watch: false,
    globals: true,
    // Nest 12 no longer loads reflect-metadata itself
    setupFiles: ['reflect-metadata'],
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));
