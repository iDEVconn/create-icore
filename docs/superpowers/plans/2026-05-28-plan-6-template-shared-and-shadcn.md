# Plan 6: Shared Template Helpers + shadcn Client Template

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, library-agnostic client foundation (`libs/template-shared`) and the first concrete UI template (`apps/templates/client-shadcn`). After this plan, `yarn nx serve client-shadcn` brings up a working SPA: landing page (lib-agnostic) → login → protected dashboard with CASL-gated pages and dirty-form blocking. Antd + MUI templates land in follow-up plans 6.1 + 6.2 using the same pattern.

**Architecture:**

- `libs/template-shared` exports the library-agnostic primitives every template re-uses: the API client wiring (`@idevconn/api-client`), the Zustand auth store, the React Query client builder, the i18next bootstrap, the `<AbilityProvider>`, the `useNotify()` hook interface, the `useLoading()` store, and the landing-page component.
- `apps/templates/client-shadcn` consumes those primitives and renders a Vite + React 19 + Tailwind 4 + shadcn/ui SPA. TanStack Router (file routes), TanStack Query, Zustand. Routes: `/` (landing), `/login`, `/_dashboard/` (protected), `/_dashboard/profile`. Library-specific code is the visual layer only — `MainLayout` shell, `PageLayout` wrapper, `LoginForm`, `ProfileForm`, `AccessDeniedPage`, and the toast host (sonner for shadcn).

**Tech Stack:** Vite 6+, React 19, Tailwind CSS 4, shadcn/ui, TanStack Router 1.x, TanStack Query 5.x, Zustand 5.x, i18next 26, react-i18next 17, `@idevconn/api-client`, `@idevconn/use-draft`, `@casl/react` 6.

**Source spec:** `docs/superpowers/specs/2026-05-28-icore-design.md`

**Branch:** `dev`. Plan 5 HEAD: `de33c41`.

**Generators only:** `nx g @nx/js:lib` for shared, `nx g @nx/react:app` for the template app.

---

## Part 1 — `libs/template-shared`

### Task 1: Scaffold the lib

- [ ] **Step 1: Generate**

```bash
cd /home/vladimir-tkach/Projects/icore
yarn nx g @nx/js:lib --name=template-shared --directory=libs/template-shared --bundler=tsc --linter=eslint --unitTestRunner=vitest --importPath=@icore/template-shared --no-interactive
```

- [ ] **Step 2: Cleanup placeholders, tsconfig.json module=node16, vitest passWithNoTests**

Same pattern as `libs/upload-client` (Plan 4 T5).

- [ ] **Step 3: Commit**

```bash
git add libs/template-shared package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(template-shared): scaffold libs/template-shared via @nx/js:lib"
```

### Task 2: API client wiring

Re-export `@idevconn/api-client`'s `createApiClient` wrapped with icore conventions (token from Zustand auth store, 401 → logout).

- [ ] **Step 1: Install deps**

```bash
yarn add @idevconn/api-client zustand react react-dom
```

- [ ] **Step 2: Auth store**

Create `libs/template-shared/src/lib/stores/auth.store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  email: string;
  role?: string;
}

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (a: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'icore-auth' },
  ),
);
```

- [ ] **Step 3: API client builder**

Create `libs/template-shared/src/lib/api/create-api.ts`:

```ts
import { createApiClient } from '@idevconn/api-client';
import { useAuthStore } from '../stores/auth.store';

export function createIcoreApi(opts: { baseUrl: string; onUnauthorized?: () => void }) {
  return createApiClient({
    baseUrl: opts.baseUrl,
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    onTokenRefreshed: ({ accessToken, refreshToken }) => {
      const user = useAuthStore.getState().user;
      if (user) useAuthStore.getState().setAuth({ accessToken, refreshToken, user });
    },
    onUnauthorized: () => {
      useAuthStore.getState().logout();
      opts.onUnauthorized?.();
    },
  });
}

export { ApiError } from '@idevconn/api-client';
```

- [ ] **Step 4: Commit**

```bash
git add libs/template-shared package.json yarn.lock
git commit -m "feat(template-shared): Zustand auth store + createIcoreApi wrapper"
```

### Task 3: i18n bootstrap

Reusable `createIcoreI18n()` that returns a configured i18next instance + locale localStorage helpers.

- [ ] **Step 1: Install deps**

```bash
yarn add i18next react-i18next
```

- [ ] **Step 2: Create the bootstrap**

Create `libs/template-shared/src/lib/i18n/create-i18n.ts`:

```ts
import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';

const STORAGE_KEY = 'icore-lang';

export type IcoreLocale = 'en' | 'ru' | 'he';
const RTL_LOCALES: ReadonlySet<IcoreLocale> = new Set(['he']);

export function getStoredLocale(fallback: IcoreLocale = 'en'): IcoreLocale {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === 'en' || v === 'ru' || v === 'he' ? v : fallback;
}

export function setStoredLocale(loc: IcoreLocale): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, loc);
  document.documentElement.dir = RTL_LOCALES.has(loc) ? 'rtl' : 'ltr';
  document.documentElement.lang = loc;
}

export interface CreateIcoreI18nOpts {
  resources: Resource;
  defaultLocale?: IcoreLocale;
}

export function createIcoreI18n(opts: CreateIcoreI18nOpts) {
  const lng = getStoredLocale(opts.defaultLocale ?? 'en');
  void i18next.use(initReactI18next).init({
    resources: opts.resources,
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  if (typeof document !== 'undefined') {
    document.documentElement.dir = RTL_LOCALES.has(lng) ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
  return i18next;
}

export { i18next };
```

- [ ] **Step 3: Default locale stubs** (English only — templates ship en+ru+he files of their own; the lib only provides the shape for shared keys like `auth.login`, `nav.profile`, etc.)

Create `libs/template-shared/src/lib/i18n/keys.ts`:

```ts
export const ICORE_LOCALES = {
  en: {
    common: {
      loading: 'Loading…',
      save: 'Save',
      cancel: 'Cancel',
      logout: 'Log out',
    },
    auth: {
      email: 'Email',
      password: 'Password',
      login: 'Log in',
      register: 'Sign up',
      switchToLogin: 'Have an account? Log in',
      switchToRegister: 'No account yet? Sign up',
    },
    nav: {
      dashboard: 'Dashboard',
      profile: 'Profile',
    },
    profile: {
      title: 'Profile',
      hint: 'Edit your account details.',
    },
    error: {
      accessDenied: 'Access denied',
      unknown: 'Something went wrong.',
    },
  },
} as const;
```

Templates merge these defaults with their own keys at i18n init time.

- [ ] **Step 4: Commit**

```bash
git add libs/template-shared package.json yarn.lock
git commit -m "feat(template-shared): i18next bootstrap + locale helpers + base resource keys"
```

### Task 4: CASL ability provider

- [ ] **Step 1: Install `@casl/react`**

```bash
yarn add @casl/react @casl/ability
```

- [ ] **Step 2: Create the provider**

Create `libs/template-shared/src/lib/abilities/ability-provider.tsx`:

```tsx
import { createContextualCan } from '@casl/react';
import { createContext, type ReactNode, useMemo } from 'react';
import { defineAbilitiesFor, emptyAbility, type AppAbility } from '@icore/shared';
import { useAuthStore } from '../stores/auth.store';

export const AbilityContext = createContext<AppAbility>(emptyAbility());

export function AbilityProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const ability = useMemo<AppAbility>(
    () =>
      user
        ? defineAbilitiesFor({ id: user.id, role: user.role === 'admin' ? 'admin' : 'user' })
        : defineAbilitiesFor(null),
    [user],
  );
  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}

export const Can = createContextualCan(AbilityContext.Consumer);
```

- [ ] **Step 3: Commit**

```bash
git add libs/template-shared package.json yarn.lock
git commit -m "feat(template-shared): AbilityProvider + <Can> bound to the Zustand auth store"
```

### Task 5: useLoading + useNotify abstractions

- [ ] **Step 1: useLoading**

Create `libs/template-shared/src/lib/stores/loading.store.ts`:

```ts
import { create } from 'zustand';

interface LoadingState {
  loading: boolean;
  setLoading: (v: boolean) => void;
}

export const useLoadingStore = create<LoadingState>((set) => ({
  loading: false,
  setLoading: (loading) => set({ loading }),
}));

export const useLoading = () => useLoadingStore((s) => s.loading);
```

- [ ] **Step 2: useNotify interface + null impl**

Create `libs/template-shared/src/lib/notify/use-notify.ts`:

```ts
export interface NotifyOptions {
  description?: string;
  duration?: number;
}

export interface Notifier {
  success(title: string, opts?: NotifyOptions): void;
  error(title: string, opts?: NotifyOptions): void;
  info(title: string, opts?: NotifyOptions): void;
  warning(title: string, opts?: NotifyOptions): void;
}

let active: Notifier = {
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warning: () => undefined,
};

export function setNotifier(n: Notifier): void {
  active = n;
}

export function useNotify(): Notifier {
  return active;
}
```

Templates call `setNotifier({ success, error, ... })` once at startup, wiring the impl (sonner / antd notification / mui snackbar) to the shared interface.

- [ ] **Step 3: Commit**

```bash
git add libs/template-shared
git commit -m "feat(template-shared): useLoading store + Notifier abstraction"
```

### Task 6: Re-export `@idevconn/use-draft`

- [ ] **Step 1: Install + re-export**

```bash
yarn add @idevconn/use-draft
```

Create `libs/template-shared/src/lib/draft/index.ts`:

```ts
export { useDraft, useDraftStore } from '@idevconn/use-draft';
```

- [ ] **Step 2: Commit**

```bash
git add libs/template-shared package.json yarn.lock
git commit -m "feat(template-shared): re-export @idevconn/use-draft for dirty-form blocking"
```

### Task 7: Landing page component (library-agnostic)

The landing renders the workspace `package.json` version and the chosen-dep versions. Templates pass in the versions they bundle.

- [ ] **Step 1: Component**

Create `libs/template-shared/src/lib/landing/LandingPage.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface LandingPageDep {
  name: string;
  version: string;
  url?: string;
}

export interface LandingPageProps {
  coreVersion: string;
  uiLibrary: 'shadcn' | 'antd' | 'mui';
  deps: LandingPageDep[];
  ctaHref?: string;
  ctaLabel?: ReactNode;
}

export function LandingPage(props: LandingPageProps) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '4rem auto',
        padding: '2rem',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ marginBottom: '0.25rem' }}>icore v{props.coreVersion}</h1>
      <p style={{ color: '#666' }}>
        Bootstrap scaffold built with <strong>{props.uiLibrary}</strong>.
      </p>

      <h2 style={{ marginTop: '2rem' }}>Installed packages</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {props.deps.map((d) => (
          <li
            key={d.name}
            style={{
              padding: '0.5rem 0',
              borderBottom: '1px solid #eee',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              {d.url ? (
                <a href={d.url} target="_blank" rel="noreferrer noopener">
                  {d.name}
                </a>
              ) : (
                d.name
              )}
            </span>
            <code style={{ color: '#888' }}>{d.version}</code>
          </li>
        ))}
      </ul>

      {props.ctaHref ? (
        <p style={{ marginTop: '2rem' }}>
          <a href={props.ctaHref} style={{ fontWeight: 600 }}>
            {props.ctaLabel ?? 'Continue →'}
          </a>
        </p>
      ) : null}
    </main>
  );
}
```

The component uses inline styles so it works without Tailwind / antd / mui imports. Templates render it as the `/` route.

- [ ] **Step 2: Barrel everything**

Update `libs/template-shared/src/index.ts`:

```ts
export * from './lib/api/create-api';
export * from './lib/stores/auth.store';
export * from './lib/stores/loading.store';
export * from './lib/abilities/ability-provider';
export * from './lib/i18n/create-i18n';
export * from './lib/i18n/keys';
export * from './lib/notify/use-notify';
export * from './lib/draft';
export * from './lib/landing/LandingPage';
```

- [ ] **Step 3: Lib package.json — add UI/React peerDeps**

`libs/template-shared/package.json` `dependencies`:

```json
"dependencies": {
  "@casl/ability": "^7.0.0",
  "@casl/react": "^6.0.0",
  "@icore/shared": "*",
  "@idevconn/api-client": "*",
  "@idevconn/use-draft": "*",
  "i18next": "^26.0.0",
  "react-i18next": "^17.0.0",
  "tslib": "^2.3.0",
  "zustand": "^5.0.0"
}
```

`peerDependencies`:

```json
"peerDependencies": {
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}
```

- [ ] **Step 4: Verify**

```bash
yarn nx test template-shared
yarn nx lint template-shared
yarn nx build template-shared
```

All green.

- [ ] **Step 5: Commit**

```bash
git add libs/template-shared package.json yarn.lock
git commit -m "feat(template-shared): library-agnostic LandingPage component + barrel"
```

---

## Part 2 — `apps/templates/client-shadcn`

### Task 8: Scaffold the Vite + React app

- [ ] **Step 1: Generate via @nx/react:app**

```bash
yarn nx g @nx/react:app --name=client-shadcn --directory=apps/templates/client-shadcn --bundler=vite --routing --style=css --linter=eslint --unitTestRunner=vitest --e2eTestRunner=playwright --no-interactive
```

- [ ] **Step 2: Smoke test the freshly generated app**

```bash
yarn nx lint client-shadcn
yarn nx test client-shadcn
yarn nx build client-shadcn
```

- [ ] **Step 3: Clean placeholders**

Delete the generator's `App.tsx` placeholder content; we'll add our own routes in Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/templates/client-shadcn apps/templates/client-shadcn-e2e package.json yarn.lock nx.json tsconfig.base.json
git commit -m "feat(client-shadcn): scaffold Vite + React 19 template via @nx/react:app"
```

### Task 9: Tailwind 4 + shadcn/ui

- [ ] **Step 1: Install Tailwind 4 + shadcn deps**

```bash
yarn add tailwindcss@^4 @tailwindcss/vite
yarn add class-variance-authority clsx tailwind-merge lucide-react sonner
yarn add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label
```

- [ ] **Step 2: Wire Tailwind into vite.config.ts**

Edit `apps/templates/client-shadcn/vite.config.ts` to add the Tailwind plugin:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ... existing config (root, build, server, etc.)
});
```

- [ ] **Step 3: globals.css**

Create `apps/templates/client-shadcn/src/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-background: oklch(0.99 0 0);
  --color-foreground: oklch(0.15 0 0);
  --color-primary: oklch(0.45 0.18 250);
  --color-primary-foreground: oklch(0.98 0 0);
  --color-muted: oklch(0.96 0 0);
  --color-muted-foreground: oklch(0.45 0 0);
  --color-border: oklch(0.92 0 0);
  --color-destructive: oklch(0.55 0.25 25);
  --radius-default: 0.5rem;
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
  html.dark {
    --color-background: oklch(0.15 0 0);
    --color-foreground: oklch(0.98 0 0);
    --color-muted: oklch(0.25 0 0);
    --color-muted-foreground: oklch(0.7 0 0);
    --color-border: oklch(0.3 0 0);
  }
}
```

Import it at the top of `src/main.tsx` (Task 10).

- [ ] **Step 4: shadcn `cn()` helper**

Create `apps/templates/client-shadcn/src/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Minimal shadcn primitives** — Button, Input, Label, Card, DropdownMenu, Dialog

Create `apps/templates/client-shadcn/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `card.tsx` — pull canonical shadcn definitions (see https://ui.shadcn.com/docs/components for current code; use the v3+ shapes). Keep each in its own file (project rule: one component per file).

Each file imports from `class-variance-authority`, `@radix-ui/react-slot`, etc., and uses the `cn` helper.

- [ ] **Step 6: Verify**

```bash
yarn nx build client-shadcn
```

Tailwind compiles, shadcn primitives type-check.

- [ ] **Step 7: Commit**

```bash
git add apps/templates/client-shadcn package.json yarn.lock
git commit -m "feat(client-shadcn): Tailwind 4 + shadcn/ui primitives (Button, Input, Label, Card)"
```

### Task 10: TanStack Router + Query + bootstrap

- [ ] **Step 1: Install TanStack libs**

```bash
yarn add @tanstack/react-router @tanstack/react-query
yarn add -D @tanstack/router-vite-plugin
```

- [ ] **Step 2: Wire the router plugin into `vite.config.ts`**

Add `TanStackRouterVite` plugin BEFORE `react()` per its docs.

- [ ] **Step 3: Create the routes**

Create `apps/templates/client-shadcn/src/routes/__root.tsx`:

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

Create `apps/templates/client-shadcn/src/routes/index.tsx` (landing):

```tsx
import { createFileRoute, Link } from '@tanstack/react-router';
import { LandingPage } from '@icore/template-shared';
import coreManifest from '@icore/package.json';
import pkg from '../../package.json';

export const Route = createFileRoute('/')({
  component: () => (
    <LandingPage
      coreVersion={coreManifest.version}
      uiLibrary="shadcn"
      deps={[
        { name: 'react', version: pkg.dependencies['react'] ?? '?' },
        { name: 'vite', version: pkg.devDependencies?.['vite'] ?? '?' },
        { name: 'tailwindcss', version: pkg.dependencies['tailwindcss'] ?? '?' },
        {
          name: '@tanstack/react-router',
          version: pkg.dependencies['@tanstack/react-router'] ?? '?',
        },
        {
          name: '@tanstack/react-query',
          version: pkg.dependencies['@tanstack/react-query'] ?? '?',
        },
        { name: 'zustand', version: pkg.dependencies['zustand'] ?? '?' },
        { name: '@casl/ability', version: pkg.dependencies['@casl/ability'] ?? '?' },
      ]}
      ctaHref="/login"
      ctaLabel={<Link to="/login">Log in →</Link>}
    />
  ),
});
```

Create `apps/templates/client-shadcn/src/routes/login.tsx` and `_dashboard.tsx` (protected layout) — see Tasks 11-12 for body.

- [ ] **Step 4: Bootstrap in `main.tsx`**

Replace `apps/templates/client-shadcn/src/main.tsx`:

```tsx
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

// Single shared API instance — used by every query in apps/templates/client-shadcn/src/queries
export const api = createIcoreApi({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  onUnauthorized: () => router.navigate({ to: '/login' }),
});

wireShadcnNotifier();

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
```

Create `apps/templates/client-shadcn/src/lib/notify.ts`:

```ts
import { toast } from 'sonner';
import { setNotifier } from '@icore/template-shared';

export function wireShadcnNotifier() {
  setNotifier({
    success: (title, opts) =>
      toast.success(title, { description: opts?.description, duration: opts?.duration }),
    error: (title, opts) =>
      toast.error(title, { description: opts?.description, duration: opts?.duration }),
    info: (title, opts) =>
      toast(title, { description: opts?.description, duration: opts?.duration }),
    warning: (title, opts) =>
      toast.warning(title, { description: opts?.description, duration: opts?.duration }),
  });
}
```

- [ ] **Step 5: Verify**

```bash
yarn nx build client-shadcn
yarn nx serve client-shadcn  # manual smoke
```

The dev server should boot at the configured port; the `/` route renders the landing.

- [ ] **Step 6: Commit**

```bash
git add apps/templates/client-shadcn package.json yarn.lock
git commit -m "feat(client-shadcn): TanStack Router + Query bootstrap, landing route, sonner notifier"
```

### Task 11: Login page

- [ ] Create `apps/templates/client-shadcn/src/routes/login.tsx` with a shadcn form: email + password Inputs, submit Button, calls `api.auth.login(email, password)`, stores session in `useAuthStore`, navigates to `/_dashboard/`.
- [ ] Form uses `useNotify().error(...)` on failure.
- [ ] Commit: `feat(client-shadcn): /login page with email/password form`

### Task 12: MainLayout + protected layout route

- [ ] Create `apps/templates/client-shadcn/src/routes/_dashboard.tsx`:
  - `beforeLoad` checks `useAuthStore.getState().accessToken`; redirects to `/login` if null.
  - Renders the `MainLayout` shell from `apps/templates/client-shadcn/src/layouts/MainLayout.tsx` wrapping `<Outlet />`.

- [ ] Create `MainLayout.tsx` (its own file under `src/layouts/`):
  - Top header: app title + locale switcher + user dropdown (Profile link + Log out).
  - Left sider (collapsible): nav links via `<Link>`.
  - Main content area with the `<Outlet />`.
  - Footer with copyright.

- [ ] Each layout sub-piece (Header, Sider, Footer) lives in its own file under `src/components/layout/` per project rule.

- [ ] Commit: `feat(client-shadcn): protected /_dashboard layout with Header + Sider + Footer`

### Task 13: PageLayout component

- [ ] Create `apps/templates/client-shadcn/src/components/PageLayout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Can, useDraft, useLoading } from '@icore/template-shared';
import { AccessDeniedPage } from './AccessDeniedPage';
import type { AbilityAction, AbilitySubject } from '@icore/shared';

export interface PageLayoutProps {
  title: ReactNode;
  description?: ReactNode;
  action?: AbilityAction;
  subject?: AbilitySubject;
  extra?: ReactNode;
  children?: ReactNode;
}

export function PageLayout({
  title,
  description,
  action = 'read',
  subject = 'all',
  extra,
  children,
}: PageLayoutProps) {
  // Reset the global dirty flag when leaving the page.
  useDraft(false);
  const loading = useLoading();

  return (
    <>
      <Can I={action} a={subject}>
        <div className="p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description ? <p className="text-muted-foreground">{description}</p> : null}
            </div>
            {extra ? <div className="flex gap-2">{extra}</div> : null}
          </div>
          <div className={loading ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
        </div>
      </Can>
      <Can not I={action} a={subject}>
        <AccessDeniedPage />
      </Can>
    </>
  );
}
```

- [ ] Create `AccessDeniedPage.tsx` (a friendly 403 page).
- [ ] Commit: `feat(client-shadcn): PageLayout with CASL gating, dirty reset, loading overlay`

### Task 14: Dashboard index + profile pages

- [ ] `apps/templates/client-shadcn/src/routes/_dashboard/index.tsx` — welcome card via shadcn `<Card>`, links to profile.

- [ ] `apps/templates/client-shadcn/src/routes/_dashboard/profile.tsx`:
  - Fetches `GET /api/profile` via React Query.
  - Renders `<PageLayout title="Profile" action="read" subject="Profile">`.
  - Form: name + email (read-only) Inputs.
  - On change → `useDraft(true)` so navigation away triggers the unsaved-changes prompt (TanStack Router blocker).
  - Save button calls a mutation; on success → `useNotify().success('Saved')` + `useDraft(false)`.

- [ ] Commit: `feat(client-shadcn): /_dashboard/{index,profile} pages with React Query + useDraft`

### Task 15: E2E smoke (Playwright)

- [ ] Add `apps/templates/client-shadcn-e2e/src/icore.spec.ts`:
  - Visit `/` → assert "icore v" heading.
  - Visit `/_dashboard/profile` → assert redirect to `/login`.
  - (Real login flow deferred — needs gateway + auth MS running in CI.)

- [ ] Commit: `test(client-shadcn): Playwright smoke — landing renders + auth gate redirects`

### Task 16: Docs

- [ ] Update `docs/architecture.md`:
  - Flip Plan 6 status to ✅ (the shadcn template ships).
  - Add a Plan 6 deliverables section: `libs/template-shared` exports + the shadcn template layout.
  - Note that antd + mui templates are tracked in follow-up plans 6.1 + 6.2.

- [ ] Commit: `docs: mark Plan 6 (template-shared + shadcn) done, document client layout`

### Task 17: Final verify

- [ ] `yarn nx run-many -t lint test build` — all 15+ projects green.
- [ ] `yarn format:check` — clean.
- [ ] Test count target: ~101 (Plan 5) + few template-shared/lib tests + Playwright smoke = bumps to ~110-115.

---

## Self-Review Notes

**Spec coverage (spec section "Client surface — pages + layouts"):**

- Landing page (library-agnostic, shows package versions) → Task 7 + Task 10 step 3 ✅
- /login → Task 11 ✅
- /\_dashboard (protected, MainLayout shell) → Task 12 ✅
- /\_dashboard/profile with useDraft → Task 14 ✅
- PageLayout with CASL `<Can>` gating → Task 13 ✅
- AccessDeniedPage → Task 13 ✅
- useNotify() abstraction with sonner impl → Task 5 + Task 10 step 4 ✅
- shadcn template (Tailwind 4 + primitives + theme tokens) → Task 9 ✅

**Out of scope for Plan 6 (locked for 6.1+):**

- antd template (Plan 6.1)
- mui template (Plan 6.2)
- OAuth / magic-link login (Plan 6+N if added)
- Real provider E2E smoke (needs CI matrix wiring; Plan 7 ships the CLI)

**Type consistency:**

- `LandingPageProps`, `Notifier`, `AuthState`, `PageLayoutProps` all stay identical across templates.
- `useDraft` / `useDraftStore` re-exported from `@idevconn/use-draft` (one source).
- `defineAbilitiesFor` / `AppAbility` from `@icore/shared` — same as backend.
- API client built from `@idevconn/api-client` with the same `getAccessToken` / `getRefreshToken` / `onUnauthorized` contract.
