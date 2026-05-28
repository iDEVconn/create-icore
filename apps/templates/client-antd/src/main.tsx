import './globals.less';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import { I18nextProvider } from 'react-i18next';
import {
  AbilityProvider,
  createIcoreApi,
  createIcoreI18n,
  ICORE_LOCALES,
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
  onUnauthorized: () => router.navigate({ to: '/login' }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
        <AntApp>
          <QueryClientProvider client={queryClient}>
            <AbilityProvider>
              <RouterProvider router={router} />
            </AbilityProvider>
          </QueryClientProvider>
        </AntApp>
      </ConfigProvider>
    </I18nextProvider>
  </StrictMode>,
);
