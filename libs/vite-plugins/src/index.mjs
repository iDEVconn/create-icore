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

/**
 * Shared Vite dev-server config: binds the given port and proxies `/api`
 * to the gateway (:3001) so the client's relative API base works in dev.
 * @param {number} port
 * @returns {import('vite').UserConfig['server']}
 */
export function commonServer(port) {
  return {
    port,
    host: 'localhost',
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  };
}

function box(lines) {
  const width = Math.max(...lines.map((l) => l.length), 48);
  const top = `╔═${'═'.repeat(width)}═╗`;
  const bot = `╚═${'═'.repeat(width)}═╝`;
  const body = lines.map((l) => `║ ${l.padEnd(width)} ║`).join('\n');
  return `\n${top}\n${body}\n${bot}`;
}

/**
 * Prints a terminal banner on dev-server start showing the API base the client
 * will use and the gateway proxy target, so misconfiguration is obvious.
 * @param {{ proxyTarget?: string }} [opts]
 * @returns {import('vite').Plugin}
 */
export function apiInfoPlugin(opts = {}) {
  const target = opts.proxyTarget ?? 'http://localhost:3001';
  return {
    name: 'icore-api-info',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const explicit = process.env.VITE_API_URL;
        const lines = explicit
          ? [`API base: VITE_API_URL = ${explicit}`, '', `(gateway dev-proxy is bypassed)`]
          : [
              `API base: /api  →  proxied to ${target}`,
              '',
              `Gateway must be running on ${target}.`,
              `Override with VITE_API_URL in the client .env.`,
            ];
        server.config.logger.info(box([`ℹ  iCore client API wiring`, '', ...lines]));
      });
    },
  };
}
