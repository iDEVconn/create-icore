/// <reference types='vitest' />
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

const rootPackageJsonPath = new URL('../../../package.json', import.meta.url);
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf-8')) as {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function depVersion(name: string): string {
  return (
    rootPackageJson.dependencies?.[name] ??
    rootPackageJson.devDependencies?.[name] ??
    '?'
  );
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
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(rootPackageJson.version),
    // Dep versions injected at build time so routes don't need JSON imports
    'import.meta.env.VITE_DEP_REACT': JSON.stringify(depVersion('react')),
    'import.meta.env.VITE_DEP_ANTD': JSON.stringify(depVersion('antd')),
    'import.meta.env.VITE_DEP_VITE': JSON.stringify(depVersion('vite')),
    'import.meta.env.VITE_DEP_TANSTACK_ROUTER': JSON.stringify(
      depVersion('@tanstack/react-router'),
    ),
    'import.meta.env.VITE_DEP_TANSTACK_QUERY': JSON.stringify(
      depVersion('@tanstack/react-query'),
    ),
    'import.meta.env.VITE_DEP_ZUSTAND': JSON.stringify(depVersion('zustand')),
    'import.meta.env.VITE_DEP_CASL': JSON.stringify(depVersion('@casl/ability')),
  },
  plugins: [
    TanStackRouterVite({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '(__tests__|\\.test\\.(t|j)sx?$)',
    }),
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    {
      name: 'inject-app-version-meta',
      transformIndexHtml(html: string) {
        return html.replace('%APP_VERSION%', rootPackageJson.version);
      },
    },
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
  },
  test: {
    name: 'client-antd',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/apps/templates/client-antd',
      provider: 'v8' as const,
    },
  },
}));
