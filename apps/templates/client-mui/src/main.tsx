import './globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { I18nextProvider } from 'react-i18next';
import {
  AbilityProvider,
  createIcoreApi,
  createIcoreI18n,
  ICORE_LOCALES,
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

const theme = createTheme({
  palette: { mode: 'light', primary: { main: '#5e60ce' } },
});

export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  onUnauthorized: () => router.navigate({ to: '/login' }),
});

wireMuiNotifier();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <AbilityProvider>
            <RouterProvider router={router} />
          </AbilityProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </I18nextProvider>
  </StrictMode>,
);
