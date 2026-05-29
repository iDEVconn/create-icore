/// <reference types='vitest' />
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import {
  commonDefines,
  commonManualChunks,
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
  cacheDir: '../../../node_modules/.vite/apps/templates/client-antd',
  server: {
    port: 4201,
    host: 'localhost',
  },
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
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    noServerModulesPlugin(),
    injectAppVersionPlugin(rootPackageJson),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
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
  test: commonTestConfig('client-antd', '../../../coverage/apps/templates/client-antd'),
}));
