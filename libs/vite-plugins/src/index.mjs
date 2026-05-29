// @icore/vite-plugins — shared Vite plugin helpers for iCore client templates.
// Plain ESM (no TypeScript syntax) so vite.config.mts can import it directly.

const SERVER_ONLY_RE = /^(@nestjs\/|firebase-admin$|bullmq$|ioredis$)/;

/**
 * Fails the Vite build if server-only modules are imported in client code.
 * @returns {import('vite').Plugin}
 */
export function noServerModulesPlugin() {
  return {
    name: 'no-server-modules',
    enforce: 'pre',
    resolveId(id, importer) {
      if (SERVER_ONLY_RE.test(id)) {
        throw new Error(
          `Server-only module "${id}" imported in client code` +
            (importer ? ` (from ${importer})` : '') +
            `. Use @icore/shared/client instead of @icore/shared for browser-safe imports.`,
        );
      }
    },
  };
}

/**
 * Replaces %APP_VERSION% in index.html with the root package.json version.
 * @param {{ version: string }} pkg
 * @returns {import('vite').Plugin}
 */
export function injectAppVersionPlugin(pkg) {
  return {
    name: 'inject-app-version-meta',
    transformIndexHtml(html) {
      return html.replace('%APP_VERSION%', pkg.version);
    },
  };
}

/**
 * Returns Vite `define` entries shared by all iCore client templates.
 * Each template spreads this and adds its own UI-lib-specific entry.
 *
 * @param {{ version: string, dependencies?: Record<string,string>, devDependencies?: Record<string,string> }} pkg
 * @returns {Record<string, string>}
 */
export function commonDefines(pkg) {
  const dep = (name) =>
    JSON.stringify(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? '?');
  return {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_DEP_REACT': dep('react'),
    'import.meta.env.VITE_DEP_VITE': dep('vite'),
    'import.meta.env.VITE_DEP_TANSTACK_ROUTER': dep('@tanstack/react-router'),
    'import.meta.env.VITE_DEP_TANSTACK_QUERY': dep('@tanstack/react-query'),
    'import.meta.env.VITE_DEP_ZUSTAND': dep('zustand'),
    'import.meta.env.VITE_DEP_CASL': dep('@casl/ability'),
  };
}

/**
 * Returns a manualChunks function with the common vendor splits pre-applied.
 * Pass a `uiChunkFn` to add UI-library-specific splits before the fallback.
 *
 * @param {(id: string) => string | undefined} [uiChunkFn]
 * @returns {(id: string) => string | undefined}
 */
export function commonManualChunks(uiChunkFn) {
  return (id) => {
    if (!id.includes('node_modules')) return undefined;
    if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler'))
      return 'vendor-react';
    if (id.includes('@tanstack')) return 'vendor-tanstack';
    if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
    if (id.includes('@casl')) return 'vendor-casl';
    if (uiChunkFn) {
      const chunk = uiChunkFn(id);
      if (chunk) return chunk;
    }
    if (id.includes('zustand')) return 'vendor-state';
    if (id.includes('@idevconn')) return 'vendor-idevconn';
    return 'vendor-core';
  };
}

/**
 * Returns a vitest `test` configuration block shared by all iCore client templates.
 *
 * @param {string} name  - project name (e.g. 'client-shadcn')
 * @param {string} coverageDir - relative path to coverage output dir
 * @returns {import('vitest/config').UserConfig['test']}
 */
export function commonTestConfig(name, coverageDir) {
  return {
    name,
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: coverageDir,
      provider: 'v8',
    },
  };
}
