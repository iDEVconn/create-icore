/// <reference types='vitest' />
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import {
  apiInfoPlugin,
  commonDefines,
  commonManualChunks,
  commonServer,
  commonTestConfig,
  injectAppVersionPlugin,
  noServerModulesPlugin,
} from '@icore/vite-plugins';

const rootPackageJsonPath = new URL('../../../package.json', import.meta.url);
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8')) as {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function depVersion(name: string): string {
  return rootPackageJson.dependencies?.[name] ?? rootPackageJson.devDependencies?.[name] ?? '?';
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/client-mui',
  server: commonServer(4202),
  preview: {
    port: 4202,
    host: 'localhost',
  },
  define: {
    ...commonDefines(rootPackageJson),
    'import.meta.env.VITE_DEP_MUI': JSON.stringify(depVersion('@mui/material')),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '(__tests__|\\.test\\.(t|j)sx?$)',
    }),
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    noServerModulesPlugin(),
    apiInfoPlugin(),
    injectAppVersionPlugin(rootPackageJson),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../../dist/apps/templates/client-mui',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rolldownOptions: {
      output: {
        manualChunks: commonManualChunks((id) => {
          if (id.includes('@mui')) return 'vendor-mui';
          if (id.includes('@emotion')) return 'vendor-emotion';
        }),
      },
    },
  },
  test: commonTestConfig('client-mui', '../../../coverage/apps/templates/client-mui'),
}));
