import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
    // `graphql` ships index.mjs (picked by Vite) next to index.js (picked by Node for the
    // externalized @nestjs/graphql and @apollo/server). Two copies break graphql's realm checks
    // ("Cannot use GraphQLScalarType from another module"), so tests use the one Node loads,
    // as the webpack build (every package external, `commonjs`) does at runtime.
    alias: [{ find: /^graphql$/, replacement: require.resolve('graphql') }],
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api',
  test: {
    name: 'api',
    watch: false,
    globals: true,
    // Nest 12 no longer loads reflect-metadata itself
    setupFiles: ['reflect-metadata'],
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api',
      provider: 'v8' as const,
    },
  },
}));
