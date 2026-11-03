/// <reference types='vitest' />
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import {
  apiInfoPlugin,
  commonDefines,
  commonManualChunks,
  commonServer,
  commonTestConfig,
  injectAppVersionPlugin,
  noServerModulesPlugin,
} from '@icore/vite-plugins';
import { nxReadySignal } from '@nx/vite/plugins/nx-ready-signal.plugin';

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
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/templates/client-antd',
  server: commonServer(4201),
  preview: {
    port: 4201,
    host: 'localhost',
  },
  define: {
    ...commonDefines(rootPackageJson),
    'import.meta.env.VITE_DEP_ANTD': JSON.stringify(depVersion('antd')),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '(__tests__|\\.test\\.(t|j)sx?$)',
    }),
    react(),
    noServerModulesPlugin(),
    apiInfoPlugin(),
    injectAppVersionPlugin(rootPackageJson),
    nxReadySignal(),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build: {
    outDir: '../../../dist/apps/templates/client-antd',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rolldownOptions: {
      output: {
        manualChunks: commonManualChunks((id) => {
          if (id.includes('/antd/') || id.includes('@ant-design') || id.includes('rc-'))
            return 'vendor-antd';
        }),
      },
    },
  },
  test: {
    ...commonTestConfig('client-antd', '../../../coverage/apps/templates/client-antd'),
    // antd's responsive components (Space, Grid) call window.matchMedia, which
    // jsdom doesn't implement — see src/test-setup.ts.
    setupFiles: ['./src/test-setup.ts'],
  },
}));
