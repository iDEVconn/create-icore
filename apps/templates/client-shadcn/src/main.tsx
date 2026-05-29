import './globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import {
  AbilityProvider,
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
  onUnauthorized: () => router.navigate({ to: '/login' }),
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
        <AbilityProvider>
          <RouterProvider router={router} />
          <Toaster richColors />
        </AbilityProvider>
      </QueryClientProvider>
    </I18nextProvider>
  </StrictMode>,
);
