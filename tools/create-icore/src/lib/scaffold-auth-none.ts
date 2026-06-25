import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function stripDeps(pkgPath: string, names: string[]): Promise<void> {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const n of names) {
      if (pkg.dependencies) delete pkg.dependencies[n];
      if (pkg.devDependencies) delete pkg.devDependencies[n];
    }
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {
    // ignore — pkg may not exist in test scaffolds
  }
}

// ─── Path exclusions ──────────────────────────────────────────────────────────

const AUTH_ONLY_PATHS = [
  'apps/microservices/auth',
  'libs/auth-strategies',
  'libs/auth-client',
  'Dockerfile.ms-auth',
  'apps/api/src/app/auth',
  'apps/api/src/app/profile',
  'apps/api/src/app/abilities',
  'libs/shared/src/abilities',
  'apps/client/src/components/auth',
  'apps/client/src/routes/login.tsx',
  'apps/client/src/routes/auth.callback.tsx',
  'apps/client/src/routes/auth.oauth.callback.tsx',
  'apps/client/src/routes/_dashboard/profile.tsx',
  'libs/template-shared/src/lib/abilities',
];

export async function removeAuthOnlyPaths(targetDir: string): Promise<void> {
  for (const p of AUTH_ONLY_PATHS) {
    await rm(join(targetDir, p), { recursive: true, force: true });
  }
  await stripDeps(join(targetDir, 'apps/api/package.json'), [
    '@icore/auth-client',
    'cookie-parser',
  ]);
}

// ─── Tsconfig alias strips ────────────────────────────────────────────────────

async function stripTsconfigPath(targetDir: string, alias: string): Promise<void> {
  const tsconfigPath = join(targetDir, 'tsconfig.base.json');
  try {
    const src = await readFile(tsconfigPath, 'utf8');
    const escaped = alias.replace(/[@/]/g, (c) => (c === '@' ? '@' : '\\/'));
    const pretty = src.replace(new RegExp(`^\\s*"${escaped}": \\[[^\\]]*\\],?\\n`, 'm'), '');
    if (pretty !== src) {
      await writeFile(tsconfigPath, pretty);
      return;
    }
    const parsed = JSON.parse(src) as { compilerOptions?: { paths?: Record<string, unknown> } };
    if (parsed.compilerOptions?.paths) delete parsed.compilerOptions.paths[alias];
    await writeFile(tsconfigPath, JSON.stringify(parsed));
  } catch {
    // ignore — tsconfig may not exist in test scaffolds
  }
}

export async function removeAuthTsconfigPaths(targetDir: string): Promise<void> {
  for (const alias of [
    '@icore/auth-client',
    '@icore/auth-supabase',
    '@icore/auth-firebase',
    '@icore/auth-mongodb',
  ]) {
    await stripTsconfigPath(targetDir, alias);
  }
}

// ─── Docker-compose auth service removal ─────────────────────────────────────

export async function removeDockerComposeAuthService(targetDir: string): Promise<void> {
  const composePath = join(targetDir, 'docker-compose.yml');
  try {
    const compose = await readFile(composePath, 'utf8');
    const next = compose
      .replace(/\n {2}auth:[\s\S]+?(?=\n {2}\w|\nnetworks:)/m, '\n')
      .replace(/\n {6}auth:\n {8}condition: service_started/g, '')
      .replace(/\n {6}AUTH_TRANSPORT:[^\n]*/g, '')
      .replace(/\n {6}AUTH_REDIS_URL:[^\n]*/g, '');
    await writeFile(composePath, next);
  } catch {
    // ignore — docker-compose.yml may not exist in test scaffolds
  }
}

// ─── Auth-none variant file contents ─────────────────────────────────────────

const GATEWAY_MAIN_TS = `\
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { formatGatewayBanner } from '@icore/shared';
import { AppModule } from './app/app.module';
import { GATEWAY_SERVICES } from './app/gateway-services';
import pkg from '@icore/package.json';

const DEFAULT_PORT = 3001;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('iCore API')
    .setDescription('iCore Gateway HTTP surface')
    .setVersion(pkg.version)
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? DEFAULT_PORT);
  await app.listen(port);
}

bootstrap()
  .then(() => {
    const origin = process.env.API_ORIGIN ?? 'http://localhost';
    const port = Number(process.env.API_PORT ?? DEFAULT_PORT);
    new Logger('API-Bootstrap').log(
      formatGatewayBanner({ port, origin, services: GATEWAY_SERVICES }),
    );
  })
  .catch((err) => {
    new Logger('API-Bootstrap').error(
      'Gateway bootstrap failed',
      err instanceof Error ? err.stack : err,
    );
    process.exit(1);
  });
`;

const GATEWAY_APP_MODULE_TS = `\
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, seconds } from '@nestjs/throttler';
import { StorageModule } from './storage/storage.module';
import { FeaturesModule } from './features.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), 'apps/api/.env'), join(process.cwd(), '.env')],
    }),
    ThrottlerModule.forRoot([{ name: 'auth-burst', ttl: seconds(60), limit: 10 }]),
    StorageModule,
    FeaturesModule,
  ],
})
export class AppModule {}
`;

const SHARED_CLIENT_TS = `\
// Browser-safe subset of @icore/shared.
// Import from '@icore/shared/client' in client-side code to avoid pulling
// in NestJS / Node.js-only modules (transport, strategies, contracts).
export * from './types';
`;

const SHARED_INDEX_TS = `\
export * from './env';
export * from './bootstrap';
export * from './jobs';
export * from './strategies';
export * from './transport';
export * from './types';
`;

const TEMPLATE_SHARED_INDEX_TS = `\
export * from './lib/api/create-api.js';
export * from './lib/stores/auth.store.js';
export * from './lib/stores/loading.store.js';
export * from './lib/i18n/create-i18n.js';
export * from './lib/i18n/keys.js';
export * from './lib/notify/use-notify.js';
export * from './lib/draft/index.js';
export * from './lib/landing/LandingPage.js';
export * from './lib/stores/theme.store.js';
`;

// ─── Client UI variants ───────────────────────────────────────────────────────

const SHADCN_MAIN_TSX = `\
import './globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import {
  createIcoreApi,
  createIcoreI18n,
  ICORE_LOCALES,
  useThemeStore,
} from '@icore/template-shared';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import { routeTree } from './routeTree.gen';
import { wireShadcnNotifier } from './lib/notify';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

// Single shared API instance — used by every query in src/queries/
export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
});

wireShadcnNotifier();

// Apply the theme class before React mounts so the first paint is correct
const applyTheme = (mode: 'light' | 'dark') => {
  document.documentElement.classList.toggle('dark', mode === 'dark');
};
applyTheme(useThemeStore.getState().mode);
useThemeStore.subscribe((s) => applyTheme(s.mode));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster richColors />
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
`;

const SHADCN_DASHBOARD_TSX = `\
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
`;

const SHADCN_INDEX_TSX = `\
import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from '@icore/template-shared';

// All version strings are injected at build time by vite.config.mts
// (reads root package.json via fs.readFileSync so they stay accurate
// even when workspace packages are bumped independently).
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

export const Route = createFileRoute('/')({
  component: () => (
    <LandingPage
      coreVersion={APP_VERSION}
      uiLibrary="shadcn"
      deps={[
        { name: 'react', version: (import.meta.env.VITE_DEP_REACT as string) ?? '?' },
        { name: 'vite', version: (import.meta.env.VITE_DEP_VITE as string) ?? '?' },
        { name: 'tailwindcss', version: (import.meta.env.VITE_DEP_TAILWINDCSS as string) ?? '?' },
        {
          name: '@tanstack/react-router',
          version: (import.meta.env.VITE_DEP_TANSTACK_ROUTER as string) ?? '?',
        },
        {
          name: '@tanstack/react-query',
          version: (import.meta.env.VITE_DEP_TANSTACK_QUERY as string) ?? '?',
        },
        { name: 'zustand', version: (import.meta.env.VITE_DEP_ZUSTAND as string) ?? '?' },
        { name: '@casl/ability', version: (import.meta.env.VITE_DEP_CASL as string) ?? '?' },
      ]}
      ctaHref="/dashboard"
      ctaLabel="Dashboard →"
    />
  ),
});
`;

const SHADCN_LAYOUT_HEADER_TSX = `\
import { setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { ThemeToggle } from '../ThemeToggle';

const LOCALES: { code: IcoreLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

export function LayoutHeader() {
  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    window.location.reload();
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[--color-border] bg-[--color-background]/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-[--color-primary]">
          <span className="text-xs font-bold text-[--color-primary-foreground]">i</span>
        </div>
        <span className="text-sm font-semibold tracking-tight">iCore</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center rounded-md border border-[--color-border] overflow-hidden mr-2">
          {LOCALES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => handleLocale(code)}
              className="px-2.5 py-1 text-xs text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground] transition-colors cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
`;

const ANTD_MAIN_TSX = `\
import './globals.less';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { I18nextProvider } from 'react-i18next';
import {
  createIcoreApi,
  createIcoreI18n,
  ICORE_LOCALES,
  useThemeStore,
} from '@icore/template-shared';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

// Single shared API instance — used by every query in src/queries/
export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
});

function Root() {
  const mode = useThemeStore((s) => s.mode);
  const algorithm = mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm;
  return (
    <ConfigProvider theme={{ algorithm, token: { colorPrimary: '#22c55e', colorLink: '#22c55e' } }}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Root />
    </I18nextProvider>
  </StrictMode>,
);
`;

const ANTD_DASHBOARD_TSX = `\
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
`;

const ANTD_INDEX_TSX = `\
import { createFileRoute, Link } from '@tanstack/react-router';
import { LandingPage } from '@icore/template-shared';

// All version strings are injected at build time by vite.config.mts
// (reads root package.json via fs.readFileSync so they stay accurate
// even when workspace packages are bumped independently).
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

export const Route = createFileRoute('/')({
  component: () => (
    <LandingPage
      coreVersion={APP_VERSION}
      uiLibrary="antd"
      deps={[
        { name: 'react', version: (import.meta.env.VITE_DEP_REACT as string) ?? '?' },
        { name: 'antd', version: (import.meta.env.VITE_DEP_ANTD as string) ?? '?' },
        { name: 'vite', version: (import.meta.env.VITE_DEP_VITE as string) ?? '?' },
        {
          name: '@tanstack/react-router',
          version: (import.meta.env.VITE_DEP_TANSTACK_ROUTER as string) ?? '?',
        },
        {
          name: '@tanstack/react-query',
          version: (import.meta.env.VITE_DEP_TANSTACK_QUERY as string) ?? '?',
        },
        { name: 'zustand', version: (import.meta.env.VITE_DEP_ZUSTAND as string) ?? '?' },
        { name: '@casl/ability', version: (import.meta.env.VITE_DEP_CASL as string) ?? '?' },
      ]}
      ctaHref="/dashboard"
      ctaLabel={<Link to="/dashboard">Dashboard →</Link>}
    />
  ),
});
`;

const ANTD_LAYOUT_HEADER_TSX = `\
import { Button, Layout, Space } from 'antd';
import { setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { ThemeToggle } from '../ThemeToggle';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

const LOCALES: { code: IcoreLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

export function LayoutHeader() {
  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    window.location.reload();
  }

  return (
    <Layout.Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <Space>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 16 }}>iCore</span>
        <span
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 11,
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          v{APP_VERSION}
        </span>
      </Space>

      <Space size="middle">
        <Space size={4}>
          {LOCALES.map(({ code, label }) => (
            <Button
              key={code}
              size="small"
              type="text"
              style={{ color: 'rgba(255,255,255,0.65)' }}
              onClick={() => handleLocale(code)}
            >
              {label}
            </Button>
          ))}
        </Space>

        <ThemeToggle />
      </Space>
    </Layout.Header>
  );
}
`;

const MUI_MAIN_TSX = `\
import './globals.css';
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { I18nextProvider } from 'react-i18next';
import {
  createIcoreApi,
  createIcoreI18n,
  ICORE_LOCALES,
  useThemeStore,
} from '@icore/template-shared';
import { routeTree } from './routeTree.gen';
import { wireMuiNotifier } from './lib/notify';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

const router = createRouter({ routeTree, context: { queryClient } });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
});

wireMuiNotifier();

function Root() {
  const mode = useThemeStore((s) => s.mode);
  const theme = useMemo(
    () => createTheme({ palette: { mode, primary: { main: '#22c55e' } } }),
    [mode],
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Root />
    </I18nextProvider>
  </StrictMode>,
);
`;

const MUI_DASHBOARD_TSX = `\
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { MainLayout } from '../layouts/MainLayout';

export const Route = createFileRoute('/_dashboard')({
  component: () => (
    <MainLayout>
      <Outlet />
    </MainLayout>
  ),
});
`;

const MUI_INDEX_TSX = `\
import { createFileRoute, Link } from '@tanstack/react-router';
import { LandingPage } from '@icore/template-shared';

// All version strings are injected at build time by vite.config.mts
// (reads root package.json via fs.readFileSync so they stay accurate
// even when workspace packages are bumped independently).
const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

export const Route = createFileRoute('/')({
  component: () => (
    <LandingPage
      coreVersion={APP_VERSION}
      uiLibrary="mui"
      deps={[
        { name: 'react', version: (import.meta.env.VITE_DEP_REACT as string) ?? '?' },
        { name: '@mui/material', version: (import.meta.env.VITE_DEP_MUI as string) ?? '?' },
        { name: 'vite', version: (import.meta.env.VITE_DEP_VITE as string) ?? '?' },
        {
          name: '@tanstack/react-router',
          version: (import.meta.env.VITE_DEP_TANSTACK_ROUTER as string) ?? '?',
        },
        {
          name: '@tanstack/react-query',
          version: (import.meta.env.VITE_DEP_TANSTACK_QUERY as string) ?? '?',
        },
        { name: 'zustand', version: (import.meta.env.VITE_DEP_ZUSTAND as string) ?? '?' },
        { name: '@casl/ability', version: (import.meta.env.VITE_DEP_CASL as string) ?? '?' },
      ]}
      ctaHref="/dashboard"
      ctaLabel={<Link to="/dashboard">Dashboard →</Link>}
    />
  ),
});
`;

const MUI_LAYOUT_HEADER_TSX = `\
import { AppBar, Box, Button, Toolbar, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { setStoredLocale, type IcoreLocale } from '@icore/template-shared';
import { ThemeToggle } from '../ThemeToggle';

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? '0.0.0-dev';

const LOCALES: { code: IcoreLocale; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'ru', label: 'RU' },
  { code: 'he', label: 'HE' },
];

export function LayoutHeader() {
  const { i18n } = useTranslation();
  const currentLocale = i18n.language as IcoreLocale;

  function handleLocale(code: IcoreLocale) {
    setStoredLocale(code);
    window.location.reload();
  }

  return (
    <AppBar position="sticky" color="default" elevation={1}>
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography variant="h6" component="div" fontWeight={600}>
          iCore{' '}
          <span style={{ opacity: 0.6, fontSize: '0.75em', fontWeight: 400 }}>v{APP_VERSION}</span>
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {LOCALES.map(({ code, label }) => (
              <Button
                key={code}
                size="small"
                variant={currentLocale === code ? 'contained' : 'text'}
                onClick={() => handleLocale(code)}
              >
                {label}
              </Button>
            ))}
          </Box>

          <ThemeToggle />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
`;

// ─── Variant overlay ──────────────────────────────────────────────────────────

const COMMON_VARIANTS: Record<string, string> = {
  'apps/api/src/main.ts': GATEWAY_MAIN_TS,
  'apps/api/src/app/app.module.ts': GATEWAY_APP_MODULE_TS,
  'libs/shared/src/client.ts': SHARED_CLIENT_TS,
  'libs/shared/src/index.ts': SHARED_INDEX_TS,
  'libs/template-shared/src/index.ts': TEMPLATE_SHARED_INDEX_TS,
};

const UI_VARIANTS: Record<string, Record<string, string>> = {
  shadcn: {
    'apps/client/src/main.tsx': SHADCN_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': SHADCN_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': SHADCN_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': SHADCN_LAYOUT_HEADER_TSX,
  },
  antd: {
    'apps/client/src/main.tsx': ANTD_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': ANTD_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': ANTD_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': ANTD_LAYOUT_HEADER_TSX,
  },
  mui: {
    'apps/client/src/main.tsx': MUI_MAIN_TSX,
    'apps/client/src/routes/_dashboard.tsx': MUI_DASHBOARD_TSX,
    'apps/client/src/routes/index.tsx': MUI_INDEX_TSX,
    'apps/client/src/components/layout/LayoutHeader.tsx': MUI_LAYOUT_HEADER_TSX,
  },
};

export async function applyAuthNoneVariants(targetDir: string, ui: string): Promise<void> {
  const uiFiles = UI_VARIANTS[ui] ?? UI_VARIANTS['shadcn'];
  const all = { ...COMMON_VARIANTS, ...uiFiles };
  for (const [rel, content] of Object.entries(all)) {
    const dest = join(targetDir, rel);
    try {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, content);
    } catch {
      // ignore — file may not exist in test scaffolds
    }
  }
}
