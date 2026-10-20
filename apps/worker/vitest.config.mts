import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/worker',
  plugins: [nxViteTsPaths()],
  resolve: {
    // `cloudflare:workers` only exists inside workerd.
    alias: {
      'cloudflare:workers': `${import.meta.dirname}/src/testing/cloudflare-workers.stub.ts`,
    },
  },
  test: {
    name: 'worker',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));
