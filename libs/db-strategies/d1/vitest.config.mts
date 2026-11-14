import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/db-strategies/d1',
  test: {
    name: 'db-d1',
    watch: false,
    globals: true,
    // Nest 12 no longer loads reflect-metadata itself
    setupFiles: ['reflect-metadata'],
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/db-strategies/d1',
      provider: 'v8' as const,
    },
  },
}));
