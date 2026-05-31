import { defineConfig, configDefaults } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/shared',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'shared',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // The strategy contract harness files only EXPORT reusable suites
    // (runAuthContract / runStorageContract / runDBContract) — they hold no
    // top-level tests, so Vitest must not try to run them directly. They follow
    // the *.unit.test.ts naming so the prod build excludes them; the concrete
    // `fake-*.contract.unit.test.ts` files (and the per-provider libs) invoke
    // the harness.
    exclude: [
      ...configDefaults.exclude,
      '**/strategies/__tests__/{auth,storage,db}.contract.unit.test.ts',
    ],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/shared',
      provider: 'v8' as const,
    },
  },
}));
