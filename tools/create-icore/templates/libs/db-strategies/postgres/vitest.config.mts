import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/db-strategies/postgres',
  test: {
    name: 'db-postgres',
    watch: false,
    globals: true,
    // Nest 12 no longer loads reflect-metadata itself
    setupFiles: ['reflect-metadata'],
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/db-strategies/postgres',
      provider: 'v8' as const,
    },
  },
}));
