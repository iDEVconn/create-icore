/// <reference types='vitest' />
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
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
  icoreVersion?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const selfPackageJson = JSON.parse(
  fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function depVersion(name: string): string {
  return (
    rootPackageJson.dependencies?.[name] ??
    rootPackageJson.devDependencies?.[name] ??
    selfPackageJson.dependencies?.[name] ??
    selfPackageJson.devDependencies?.[name] ??
    '?'
  );
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/apps/templates/client-shadcn',
  server: commonServer(4200),
  preview: {
    port: 4200,
    host: 'localhost',
  },
  define: {
    ...commonDefines(rootPackageJson),
    'import.meta.env.VITE_ICORE_VERSION': JSON.stringify(
      rootPackageJson.icoreVersion ?? rootPackageJson.version,
    ),
    'import.meta.env.VITE_DEP_TAILWINDCSS': JSON.stringify(depVersion('tailwindcss')),
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '(__tests__|\\.test\\.(t|j)sx?$)',
    }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: 'iCore App',
        short_name: 'iCore',
        description: 'Replace with your product name and description before shipping.',
        theme_color: '#4f46e5',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every response that could carry auth state, session tokens, or
        // per-user medical/business data must never be served from cache —
        // NetworkOnly means "route through the service worker but always
        // hit the network", so a stale/offline API response cannot leak
        // across users or outlive a logout.
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) =>
              ['style', 'script', 'worker', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'static-resources' },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
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
    outDir: '../../../dist/apps/templates/client-shadcn',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rolldownOptions: {
      output: {
        manualChunks: commonManualChunks((id) => {
          if (id.includes('lucide-react') || id.includes('@radix-ui')) return 'vendor-ui';
        }),
      },
    },
  },
  test: commonTestConfig('client-shadcn', '../../../coverage/apps/templates/client-shadcn'),
}));
