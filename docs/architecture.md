# iCore Architecture

High-level view of how iCore is assembled. Detailed design lives in `docs/superpowers/specs/2026-05-28-icore-design.md`; build plans in `docs/superpowers/plans/`.

## Status

| Plan | Scope                                          | State   |
| ---- | ---------------------------------------------- | ------- |
| 1    | Workspace + shared contracts (`libs/shared`)   | ✅ done |
| 2    | Supabase auth MS + gateway `AuthGuard` + CASL  | ✅ done |
| 3    | Firebase auth strategy + ADMINS_LIST hook      | ✅ done |
| 4    | Supabase storage MS + gateway storage routes   | ✅ done |
| 5    | Firebase + Cloudinary storage strategies       | ✅ done |
| 6    | Client shell (Vite + shadcn + TanStack Router) | ✅ done |
| 7    | `@idevconn/create-icore` CLI + publish         | ✅ done |
| 6.1  | Ant Design 6 client template                   | ✅ done |
| 6.2  | MUI 6 client template                          | ✅ done |
| 8    | `DBStrategy` lib + CLI `DB_PROVIDER` env       | ✅ done |
| 6.3  | Unified light/dark theme switching             | ✅ done |
| 6.4  | Magic-link email sign-in (passwordless)        | ✅ done |
| 6.5  | OAuth (Google + GitHub) server-mediated        | ✅ done |
| 9    | Payment MS via @idevconn/payment               | ✅ done |
| 10   | Notes sample MS + gateway CRUD + templates UI  | ✅ done |
| 11   | docker-compose local dev stack + Dockerfiles   | ✅ done |
| 12   | BullMQ jobs MS + bull-board admin UI           | ✅ done |

## Layout

```
icore/
├── apps/
│   ├── api/                                          # NestJS gateway (only public surface)
│   ├── microservices/
│   │   ├── auth/                                     # AuthStrategy consumer (password / magic-link / OAuth)
│   │   ├── upload/                                   # StorageStrategy consumer
│   │   ├── payment/                                  # @idevconn/payment registry (opt-in via --payment=paypal)
│   │   ├── notes/                                    # DBStrategy-backed sample CRUD
│   │   └── jobs/                                     # BullMQ workers (opt-in via --jobs=bullmq)
│   └── templates/{client-shadcn,client-antd,client-mui}/  # Vite + React 19 — CLI picks one
├── libs/
│   ├── shared/                                       # types, CASL, contracts, transport, ICORE_QUEUES
│   ├── auth-strategies/{supabase,firebase}/
│   ├── storage-strategies/{supabase,firebase,cloudinary}/
│   ├── db-strategies/{supabase,firestore}/
│   ├── auth-client/                                  # gateway → auth MS
│   ├── upload-client/                                # gateway → upload MS
│   ├── payment-client/                               # gateway → payment MS
│   ├── notes-client/                                 # gateway → notes MS
│   ├── jobs-client/                                  # any consumer → Redis (BullMQ Queue)
│   └── template-shared/                              # library-agnostic React foundation
├── Dockerfile.{gateway,ms-auth,ms-upload,ms-jobs}
├── docker-compose.yml
└── tools/
    └── create-icore/                                 # npx CLI source
```

## Shared library (`libs/shared`) — current contents

- `defineAbilitiesFor(user)` — single source of truth for CASL rules. Used by both server (`AbilityGuard`) and client (`<AbilityProvider>`).
- `AuthStrategy` / `StorageStrategy` — provider-agnostic contracts in `src/strategies/`.
- `runAuthContract(name, factory)` / `runStorageContract(name, factory)` — re-runnable Vitest suites; every concrete strategy lib runs them.
- `FakeAuthStrategy` / `FakeStorageStrategy` — in-memory reference implementations. Pass the contract suites, double as test stand-ins for the future gateway/MS smoke E2E.
- `buildTransport(prefix)` — reads `${prefix}_TRANSPORT` env (`tcp` | `redis` | `nats`) and returns NestJS `ClientOptions`. Same helper on gateway and inside each MS `main.ts` so the transport choice is environment-driven.

## Strategy pattern

Both auth and storage hide behind a single interface. NestJS module wires a factory provider that reads the provider name from `ConfigService` and returns the concrete strategy. Three env layers:

| Layer                | Owner             | Example vars                                                                                                     |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Workspace root       | generated `.env`  | `DB_PROVIDER` (`supabase` \| `firebase`) — readable by any MS via `ConfigModule.forRoot({ envFilePath: [...] })` |
| Transport wiring     | gateway + each MS | `AUTH_TRANSPORT`, `AUTH_HOST`, `AUTH_PORT`, `UPLOAD_TRANSPORT`, …                                                |
| Provider selection   | per microservice  | `AUTH_PROVIDER` (`supabase` \| `firebase`), `STORAGE_PROVIDER` (`supabase` \| `firebase` \| `cloudinary`)        |
| Provider credentials | concrete strategy | `SUPABASE_*`, `FB_ADMIN_*`, `CLOUDINARY_*`                                                                       |

`libs/shared` is env-free. Env IO happens at the MS module boundary.

### Env keys per app / MS (v0.1.0)

| File                             | Keys                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace `.env` (root)          | `DB_PROVIDER` (`supabase` \| `firebase`) — written by the CLI; consumed by any application-data MS that wires `DBStrategy`                                                                                                                                                            |
| `apps/api/.env`                  | `API_ORIGIN`, `API_PORT`, `AUTH_TRANSPORT`/`AUTH_HOST`/`AUTH_PORT`, `UPLOAD_TRANSPORT`/`UPLOAD_HOST`/`UPLOAD_PORT`, `MAX_FILE_SIZE_KB` (+ optional `AUTH_REDIS_URL` / `AUTH_NATS_URL` / `UPLOAD_REDIS_URL` / `UPLOAD_NATS_URL`)                                                       |
| `apps/microservices/auth/.env`   | `AUTH_TRANSPORT`, `AUTH_HOST`, `AUTH_PORT`, `AUTH_PROVIDER` (`supabase` \| `firebase`), `ADMINS_LIST` (CSV emails), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FB_ADMIN_*` + `FIREBASE_WEB_API_KEY` (when `AUTH_PROVIDER=firebase`)                                                |
| `apps/microservices/upload/.env` | `UPLOAD_TRANSPORT`, `UPLOAD_HOST`, `UPLOAD_PORT`, `STORAGE_PROVIDER` (`supabase` \| `firebase` \| `cloudinary`), `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_STORAGE_BUCKET` (when supabase), `FB_ADMIN_*` + `FIREBASE_STORAGE_BUCKET` (Plan 5), `CLOUDINARY_*` (Plan 5) |

## Plan 2 deliverables (active)

- `apps/api` — NestJS gateway. Global `/api` prefix. Swagger UI at `/api/docs` (version synced from root `package.json`). `ThrottlerModule` (auth-burst 10/60s). Two global `APP_GUARD`s registered in order: `AuthGuard` (resolves Bearer → `req.user` via auth MS) then `AbilityGuard` (enforces `@CheckAbility` against CASL `defineAbilitiesFor`).
- `apps/microservices/auth` — NestJS microservice. `createMicroservice(buildTransport('AUTH'))`. `ConfigModule.forRoot` loads `apps/microservices/auth/.env`. Factory provider for `AuthStrategy` reads `AUTH_PROVIDER`. `@MessagePattern` handlers: `auth.verify`, `auth.login`, `auth.signup`, `auth.refresh`, `auth.setRole`.
- `libs/auth-strategies/supabase` — `SupabaseAuthStrategy` adapting `@supabase/supabase-js`. Passes `runAuthContract` (7 cases) with a mocked `SupabaseClient`.
- `libs/auth-client` — `AuthClientModule.forRoot()` + `AuthClientService`. Used by gateway `AuthGuard` and `AuthController`.

## Plan 3 deliverables (active)

- `libs/auth-strategies/firebase` — `FirebaseAuthStrategy` adapts two surfaces: `firebase-admin` for `verifyToken` / `setRole` / `getRole`, and `HttpIdentityToolkitClient` (plain `fetch` against Identity Toolkit REST endpoints) for `signUp` / `signIn` / `refresh`. Passes the same 9 `runAuthContract` cases as Supabase.
- `AuthStrategy.getRole(uid)` added to the shared contract. All three strategies (Fake, Supabase, Firebase) implement it; the two new contract cases assert `null` for an unassigned user and the most-recent value after `setRole`.
- Auth MS `auth.signup` now atomically assigns an initial role: `ADMINS_LIST` (comma-separated, case-insensitive) members get `'admin'`, everyone else gets `'user'`. Idempotent — never overwrites an existing role.
- `apps/microservices/auth/.env.example` documents `ADMINS_LIST` and `FIREBASE_WEB_API_KEY`.

## Plan 4 deliverables (active)

- `libs/storage-strategies/supabase` — `SupabaseStorageStrategy` adapts `@supabase/supabase-js`'s storage surface (`storage.from(bucket).upload/remove/createSignedUrl/list`). Passes the 7 `runStorageContract` cases with a mocked client. Strategy enforces `path.startsWith(userId + '/')` internally — defense-in-depth alongside the gateway-side `assertOwnership`.
- `apps/microservices/upload` — NestJS microservice. `createMicroservice(buildTransportMS('UPLOAD'))`. `ConfigModule.forRoot` loads `apps/microservices/upload/.env`. Factory provider for `StorageStrategy` reads `STORAGE_PROVIDER`. `@MessagePattern` handlers: `storage.upload`, `storage.remove`, `storage.signedUrl`, `storage.list`. Buffers cross the wire as base64.
- `libs/upload-client` — `UploadClientModule.forRoot()` + `UploadClientService`. Used by gateway `StorageController`. Encodes `Buffer` to base64 before sending; the MS decodes on entry.
- `apps/api/src/app/storage/` — `StorageController` exposes `POST /api/storage/upload` (multer `FileInterceptor` + `MAX_FILE_SIZE_KB` cap), `GET /api/storage/signed-url`, `DELETE /api/storage/remove`, `GET /api/storage/list`. All four require Bearer auth (no `@Public()`). Swagger annotations include `@ApiBearerAuth` + per-route `@ApiOperation`.
- `apps/api/src/app/storage/assert-ownership.ts` — exported helper called BEFORE every `signed-url` and `remove` invocation. Rejects foreign-prefix paths with `ForbiddenException`. Strategy implementations re-check the same invariant — two layers.

## Plan 5 deliverables (active)

- `libs/storage-strategies/firebase` — `FirebaseStorageStrategy` over `firebase-admin`'s `bucket(name).file(path).{save,delete,getSignedUrl}` surface, plus `bucket.getFiles({prefix})`. Same 7 contract cases pass with a mocked bucket.
- `libs/storage-strategies/cloudinary` — `CloudinaryStorageStrategy` over a `CloudinaryApiLike` interface mapping `upload_stream` / `destroy` / `private_download_url` / `api.resources`. Cloudinary has no buckets, so the strategy synthesises `StorageRef.bucket` from the optional `CLOUDINARY_BUCKET_TAG` env (default `'cloudinary'`).
- Upload MS factory now handles all three providers — flipping `STORAGE_PROVIDER` switches the entire backend; the gateway is unaware.

## Plan 6 deliverables (active)

- `libs/template-shared` — library-agnostic React foundation shared by every UI template. Exports the Zustand `useAuthStore`, `createIcoreApi` wrapper around `@idevconn/api-client`, i18next bootstrap (`createIcoreI18n` + `ICORE_LOCALES`) with en/ru/he + RTL helpers, `AbilityProvider` + `Can` bound to the auth store, `useLoading`/`useLoadingStore`, the `useNotify` / `setNotifier` abstraction, a re-export of `@idevconn/use-draft`, and the inline-styled `LandingPage` component.
- `apps/templates/client-shadcn` — Vite 6 + React 19 + Tailwind 4 + shadcn/ui + TanStack Router + TanStack Query. Routes: `/` (landing reading `VITE_APP_VERSION` from the root `package.json`), `/login`, `/_dashboard` (pathless protected layout) → `/dashboard` + `/profile`. Layout split into `LayoutHeader` / `LayoutSider` / `LayoutFooter` files. Sonner toaster wired through `setNotifier`. `PageLayout` gates with `<Can>` from `@casl/react@7` (passThrough + render-prop) and resets the global dirty flag via `useDraft(false)`; the profile page enables blocking with `useDraft(dirty)`.
- `apps/templates/client-shadcn-e2e` — Playwright smoke suite (4 cases): landing heading contains `iCore v`, login form labels visible, `/dashboard` and `/profile` redirect to `/login` when unauthenticated. NOTE: browsers cannot install on Ubuntu 26.04-x64; tests run on a supported CI runner only.
- Antd template shipped in Plan 6.1 (see below). MUI template shipped in Plan 6.2 (see below) — same shared lib, same route tree, library-specific layout + form components.

## Routes (gateway, v0.1.0)

| Route                         | Auth        | CASL | Notes                                     |
| ----------------------------- | ----------- | ---- | ----------------------------------------- |
| `POST /api/auth/register`     | `@Public()` | —    | Forwards to auth MS `auth.signup`         |
| `POST /api/auth/login`        | `@Public()` | —    | Forwards to auth MS `auth.login`          |
| `POST /api/auth/refresh`      | `@Public()` | —    | Forwards to auth MS `auth.refresh`        |
| `GET /api/profile`            | Bearer      | —    | Returns `req.user` set by `AuthGuard`     |
| `POST /api/storage/upload`    | Bearer      | —    | Multipart upload, returns `StorageRef`    |
| `GET /api/storage/signed-url` | Bearer      | —    | `assertOwnership` → upload MS `signedUrl` |
| `DELETE /api/storage/remove`  | Bearer      | —    | `assertOwnership` → upload MS `remove`    |
| `GET /api/storage/list`       | Bearer      | —    | Returns caller's `StorageRef[]`           |
| `GET /api/docs`               | Open        | —    | Swagger UI                                |

## Conventions

- Generators only — `yarn nx g @nx/<plugin>:<schematic>`. Never hand-write `project.json`.
- Tests live in `src/**/__tests__/` next to the source they exercise.
- One responsibility per file.
- Strategy libs depend on `@icore/shared` for the contract; they do not depend on `@nestjs/*` runtime — DI wiring happens in the consuming MS module.
- Yarn 4 with `nodeLinker: node-modules` (NOT PnP — PnP blocks `nx g` generators that spawn yarn via corepack).
- NestJS apps and MSes set `module: node16, moduleResolution: node16` in their tsconfig. Vite client sets `moduleResolution: bundler`. `tsconfig.base.json` deliberately leaves both unset so each project picks what it needs.

## Plan 6.1 deliverables (complete)

- `apps/templates/client-antd/` — Vite 6 + React 19 + Ant Design 6 + TanStack Router + TanStack Query. Routes mirror `client-shadcn`: `/` (landing reading `VITE_APP_VERSION`), `/login`, `/_dashboard` (pathless protected layout) → `/dashboard` + `/profile`. Ant Design `ConfigProvider` with dark algorithm wired at `main.tsx`. Layout split into `LayoutHeader` / `LayoutSider` / `LayoutFooter` using `antd` `Layout.*` subcomponents. `notification.useNotification()` wired via `setNotifier` (same abstraction as shadcn's Sonner binding). `PageLayout` gates with `<Can>` and resets global dirty flag.
- `apps/templates/client-antd-e2e/` — Playwright smoke suite (4 cases): landing heading contains `iCore v` and `antd` text visible, login form labels visible, `/_dashboard/dashboard` and `/_dashboard/profile` redirect to `/login` when unauthenticated. NOTE: browsers cannot install on Ubuntu 26.04-x64; tests run on a supported CI runner only.
- `tools/create-icore` CLI updated: `--ui=antd` now routes to the real `apps/templates/client-antd` snapshot instead of falling back to shadcn. The UI library prompt label changed from "Ant Design (coming soon — falls back to shadcn)" to "Ant Design 6". Only `mui` still fell back to shadcn (Plan 6.2). CLI test count grew by 1 (antd selection path).

## Plan 6.2 deliverables (complete)

- `apps/templates/client-mui/` — Vite 6 + React 19 + MUI 6 (Material Design) + TanStack Router + TanStack Query. Routes mirror `client-shadcn` and `client-antd`: `/` (landing reading `VITE_APP_VERSION`), `/login`, `/_dashboard` (pathless protected layout) → `/dashboard` + `/profile`. `ThemeProvider` with dark mode (`createTheme({ palette: { mode: 'dark' } })`) wired at `main.tsx`. Layout split into `LayoutHeader` / `LayoutSider` / `LayoutFooter` using MUI `AppBar`, `Drawer`, and `Box` subcomponents. Custom `MuiNotifierHost` Snackbar host wired via `setNotifier` — Zustand-backed queue renders stacked `Alert` toasts inside a `Snackbar`. `PageLayout` gates with `<Can>` and resets global dirty flag.
- `apps/templates/client-mui-e2e/` — Playwright smoke suite (4 cases): landing heading contains `iCore v` and `mui` text visible, login form labels visible, `/_dashboard/dashboard` and `/_dashboard/profile` redirect to `/login` when unauthenticated. `playwright.config.ts` `webServer` targets `yarn nx serve client-mui` on port `:4202`. NOTE: browsers cannot install on Ubuntu 26.04-x64; tests run on a supported CI runner only.
- `tools/create-icore` CLI updated: `--ui=mui` now routes to the real `apps/templates/client-mui` snapshot; no fallback to shadcn. The UI library prompt label changed from "MUI (coming soon — falls back to shadcn)" to "MUI 6 (Material Design)". All three UI dimensions (`shadcn`, `antd`, `mui`) are first-class — no choice falls back any more. CLI test count grew by 1 (mui selection path).

## Plan 7 deliverables (complete)

- `tools/create-icore/` — `@idevconn/create-icore` CLI built with tsup. Entry: `dist/cli.js`. Templates baked into `tools/create-icore/templates/` by a build-time snapshot of the current monorepo source.
- Interactive prompts via `@clack/prompts` 1.4+: project name → auth provider → db provider (records the choice, mirrors auth in v0.1.0) → upload provider (with `none` opt-out) → UI library → MS transport → init git → run install.
- Non-interactive via flags: `--auth=supabase|firebase`, `--db=supabase|firebase`, `--upload=supabase|firebase|cloudinary|none`, `--ui=shadcn|antd|mui`, `--transport=tcp|redis|nats`, `--no-git`, `--no-install`. The legacy `--storage` flag is a deprecated alias that warns and maps to `--upload`.
- `scaffold()` copies templates, rewrites `.env.example` → `.env` per provider selection, removes the upload stack when `--upload=none`, runs `git init` + initial commit + `yarn install`.
- 19 tests cover env rewriting, flag parsing, deprecated-storage alias, upload=none stack removal, antd template selection, and full dry-run integration smoke.
- Published to npm via OIDC trusted publishing + changesets (see `.github/workflows/release.yml`).

## Plan 8 deliverables (complete)

- `libs/shared/src/strategies/db.ts` — `DBStrategy` contract + `WhereClause` / `QueryOptions` / `DBDocument<T>` types. Generic per-collection CRUD (`get`/`set`/`update`/`delete`/`list`) that works for both relational (Postgres tables) and schemaless (Firestore documents) backends. `runDBContract` (12 cases) + `FakeDBStrategy` (in-memory) ship alongside in `@icore/shared`.
- `libs/db-strategies/supabase` — `SupabaseDBStrategy` over `@supabase/supabase-js`'s Postgres surface. Convention: each `collection` is a Postgres table shaped `(id text primary key, data jsonb)`. Filters use the `data->>'field'` JSONB path. Future Plan 8.1 can ship a migration generator for the convention.
- `libs/db-strategies/firestore` — `FirestoreDBStrategy` over a `FirestoreLike` narrowed interface. Consumers wire the real `admin.firestore()` at boot. `update`/`delete` pre-check `.get()` to enforce the contract's "throw on missing" invariant even though real Firestore is lenient.
- CLI writes `DB_PROVIDER` to the generated workspace-root `.env`. The `--db` flag is now a fully independent runtime dimension — `--auth=firebase --db=supabase` is a first-class combo.

## Plan 6.3 deliverables (complete)

- `libs/template-shared/src/lib/stores/theme.store.ts` — Zustand `persist` store with `mode: 'light' | 'dark'`, `setMode(m)`, and `toggle()`. Persisted to localStorage key `icore-theme`. `detectInitial()` reads `prefers-color-scheme: dark` matchMedia on first load; subsequent loads restore from storage. `useTheme()` is a convenience re-export of the full store.
- **shadcn template** — `useThemeStore` subscribed in `main.tsx` before React mounts; toggles `html.dark` class on `document.documentElement`. Tailwind 4 `@layer base { html.dark { … } }` in `globals.css` already defined dark token overrides. `ThemeToggle.tsx` uses shadcn `Button variant="ghost" size="icon"` with `lucide-react` `Sun`/`Moon` icons. Mounted in `LayoutHeader` between the locale switcher and user controls.
- **antd template** — `main.tsx` refactored to a `Root` component that subscribes to `useThemeStore` and passes `theme.darkAlgorithm` or `theme.defaultAlgorithm` to `ConfigProvider.theme.algorithm`. `ThemeToggle.tsx` uses antd `Button type="text" size="small"` with `@ant-design/icons` `MoonOutlined`/`SunOutlined`. Mounted in `LayoutHeader` alongside the locale switcher. The `export const api` and the router/queryClient singletons remain outside `Root`.
- **MUI template** — same `Root` component pattern; `createTheme({ palette: { mode } })` wrapped in `useMemo` to avoid re-creating the theme on every render. `ThemeToggle.tsx` uses MUI `IconButton color="inherit"` with `@mui/icons-material` `LightModeIcon`/`DarkModeIcon`. Mounted in `LayoutHeader` alongside the locale switcher and account icon.

## Plan 6.4 deliverables (complete)

- `AuthStrategy` gains `sendMagicLink({ email, callbackUrl })` and `verifyMagicLink(token)` (`libs/shared/src/strategies/auth.ts`). `runAuthContract` accepts an optional `helpers.getMagicLinkToken(strategy, email)` so each concrete strategy can plug in its provider mock's token registry without leaking a side-channel on the production interface; when omitted, the magic-link contract cases skip (kept Plan 6.4 backward-compatible for any future strategy that doesn't support magic-link).
- `FakeAuthStrategy` — in-memory `magicLinkTokens` map + `getLastMagicLinkToken(email)` accessor used by the Fake's own contract test.
- **Supabase** (`libs/auth-strategies/supabase`) — `signInWithOtp({ email, options: { emailRedirectTo } })` to send + `verifyOtp({ type: 'magiclink', token_hash })` to redeem. `createMockSupabaseClient()` now returns `{ client, getMagicLinkToken }`; the existing auth-MS Supabase integration test reads `.client` to keep the constructor signature unchanged.
- **Firebase** (`libs/auth-strategies/firebase`) — `HttpIdentityToolkitClient` gains `sendOobCode` + `signInWithEmailLink`. Because `signInWithEmailLink` needs BOTH the email AND the `oobCode`, the strategy serialises them as `base64(email):oobCode` so the contract's single-string `token` shape stays intact; verify decodes and re-issues. Mock toolkit exposes `getOobCode(email)` so the contract harness composes the token the same way.
- **Auth MS** — two new `@MessagePattern`s: `auth.magicLink.send` and `auth.magicLink.verify`. Verify reuses `assignInitialRole(uid, email)` so first-time magic-link sign-ups land in the ADMINS_LIST → role hook just like password signup.
- **auth-client** — `sendMagicLink(email, callbackUrl)` and `verifyMagicLink(token)` typed wrappers.
- **Gateway** — `POST /api/auth/magic-link` and `POST /api/auth/magic-link/verify`, both `@Public()` and inside the existing `auth-burst` Throttle. `requestMagicLink` builds `${CLIENT_ORIGIN ?? 'http://localhost:4200'}/auth/callback` as the redirect target so the link lands on the client's callback page.
- **All three templates** — `/login` now has a Password / Magic-link mode switch (shadcn `Button` toggle, antd `Segmented`, MUI `Tabs`). After Send → confirmation panel with "Use a different email" reset. New `/auth/callback` route reads `?token=…` / `?token_hash=…` (Supabase) or `?oobCode=…&email=…` (Firebase), composes the opaque token, and POSTs to `/auth/magic-link/verify` → `setAuth` → redirect to `/_dashboard/dashboard`. All copy goes through new i18n keys: `auth.withPassword`, `auth.withMagicLink`, `auth.sendMagicLink`, `auth.magicLinkSent`, `auth.magicLinkSentDescription`, `auth.magicLinkUseDifferentEmail`, `auth.callbackVerifying`, `auth.callbackFailed`, `auth.callbackMissingToken`.
- **Vendor chunking** — each template's `vite.config.mts` now defines a `build.rolldownOptions.output.manualChunks` that splits `node_modules` into library-specific vendor bundles (`vendor-react`, `vendor-tanstack`, `vendor-i18n`, `vendor-casl`, `vendor-state`, `vendor-idevconn` + library: `vendor-ui`/`vendor-antd`/`vendor-mui`+`vendor-emotion`). Pattern mirrors the warranty project's vite config but without route-area splits since templates ship minimal route surfaces.

## Plan 6.5 deliverables (complete)

- `AuthStrategy` gains `startOAuth(provider, callbackUrl)` and `completeOAuth(provider, code, state)`. `runAuthContract` accepts an optional `helpers.getOAuthCode(strategy, provider, email)` — when omitted, the OAuth contract cases skip.
- `FakeAuthStrategy` ships an in-memory OAuth state map + `getLastOAuthChallenge(provider, email)` accessor used by its own contract test.
- **Supabase** — `signInWithOAuth({ provider, options: { skipBrowserRedirect: true } })` returns the provider URL; `exchangeCodeForSession(code)` completes the flow. Mock adds matching `signInWithOAuth` + `exchangeCodeForSession` + a `{code → email}` registry exposed via `getOAuthChallenge`.
- **Firebase** — builds Google/GitHub authorize URLs directly (env-driven `clientId`); exchange via a new `OAuthTokenClient` (`HttpOAuthTokenClient` for prod, mock for tests) then mints a Firebase session via Identity Toolkit `signInWithIdp`. New strategy options `oauth` (per-provider client id + secret) and `oauthTokenClient`.
- **Gateway** — `GET /api/auth/oauth/:provider` writes an `HttpOnly + SameSite=Lax` `oauth_state` cookie + redirects to the provider. `GET /api/auth/oauth/:provider/callback` verifies the cookie state vs. the query `state`, calls `auth.oauth.complete`, then redirects to `${CLIENT_ORIGIN}/auth/oauth/callback#accessToken=…&refreshToken=…&userId=…&email=…`. Cookie-parser added to the gateway main bootstrap.
- **All three templates** — `/login` now sports "Continue with Google" + "Continue with GitHub" buttons (shadcn outline + lucide, antd `Button` + `@ant-design/icons` Google/Github, MUI outlined `Button` + `@mui/icons-material` Google/GitHub). New `/auth/oauth/callback` route parses the URL fragment, calls `setAuth`, redirects to the dashboard. i18n keys added: `auth.continueWithGoogle`, `auth.continueWithGithub`, `auth.oauthFailed`, `auth.oauthCallbackMissingTokens`.

## Plan 9 deliverables (complete)

- `apps/microservices/payment` — Nest MS hosting `@idevconn/payment`'s `PaymentRegistry`. Factory reads `PAYMENT_PROVIDER` (defaults to `paypal`) and wires `PaypalStrategy` with `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` + `PAYPAL_ENVIRONMENT`. Three `@MessagePattern` handlers: `payment.createOrder`, `payment.captureOrder`, `payment.providers`.
- `libs/payment-client` (`@icore/payment-client`) — NestJS module + service wrapping the MS over the standard `buildTransport('PAYMENT')` transport. Carries `Idempotency-Key` through as `RequestOptions.idempotencyKey`.
- `apps/api/src/app/payment` — gateway routes `POST /api/payment/orders`, `POST /api/payment/orders/:id/capture`, `GET /api/payment/providers`. All auth-guarded; `Idempotency-Key` HTTP header forwarded as `RequestOptions`.
- **CLI** — new `--payment=paypal|none` flag (default `none`). When `paypal`, scaffold writes `PAYMENT_PROVIDER=paypal` + transport-matched URLs to the MS `.env`. When `none`, `removePaymentStack` deletes `apps/microservices/payment`, `libs/payment-client`, `apps/api/src/app/payment`, and strips `PaymentModule` from `app.module.ts`.
- **Scope kept tight** — webhook signature verification + `getOrder` are out of scope because `@idevconn/payment` v1.2 doesn't expose them. Add when the package does.

### Payment — usage

```ts
// Client side — react-query mutation creating a PayPal order
const createOrder = useMutation({
  mutationFn: (cart: { amount: string; currency: string }) =>
    api<{ orderId: string; status: string; approveUrl?: string }>('/payment/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(cart),
    }),
  onSuccess: (order) => {
    if (order.approveUrl) window.location.assign(order.approveUrl);
  },
});

// After the buyer returns from PayPal, capture the order
const captureOrder = useMutation({
  mutationFn: (orderId: string) =>
    api<{ orderId: string; status: string }>(`/payment/orders/${orderId}/capture`, {
      method: 'POST',
    }),
});
```

```ts
// Server-side (any MS) — enqueue a follow-up job after capture
constructor(private readonly jobs: JobsClientService) {}

async onPaymentCaptured(orderId: string, buyerEmail: string) {
  await this.jobs.enqueue('email', {
    to: buyerEmail,
    subject: 'Receipt',
    body: `Thanks! Order ${orderId} is paid.`,
  });
}
```

## Plan 10 deliverables (complete)

- `libs/shared/src/types/note.ts` — `Note` + `ListNotesOptions` types exported from `@icore/shared`.
- `libs/shared/src/abilities/ability.ts` — `defineAbilitiesFor` now grants `read/update/delete Note { ownerId: user.id }` to plain users + `create Note` unconditionally; admin still gets `manage all`. Added 5 contract tests (46 total).
- `apps/microservices/notes` — Nest MS hosting `DBStrategy` factory that wires SupabaseDBStrategy or FirestoreDBStrategy from `DB_PROVIDER`. Five `@MessagePattern` handlers: `notes.list/get/create/update/delete`. 7 unit tests against `FakeDBStrategy`.
- `libs/notes-client` (`@icore/notes-client`) — NestJS module + service wrapping the MS over `buildTransport('NOTES')`.
- `apps/api/src/app/notes` — gateway controller with `Get /notes`, `Get /notes/:id`, `Post /notes`, `Patch /notes/:id`, `Delete /notes/:id`. Owner-scoped via `req.user.uid`; admin sees all (passes `ownerId=null` to MS). CASL gates each non-list operation via `subject('Note', loadedNote)`. 9 controller tests covering 403/404/admin paths.
- **All three templates** — new `/_dashboard/notes` route + TanStack Query hooks (`useNotesList/useCreateNote/useUpdateNote/useDeleteNote`) + library-specific UI (shadcn: custom Table + Dialog primitives; antd: `Table` + `Modal` + `Popconfirm`; MUI: `Table` + `Dialog` + `TablePagination`). Sidebar nav item added to each. New i18n keys: `notes.*`.
- `libs/template-shared` `PageLayout` (shadcn) gains an `actions` slot rendered next to the title (mirrors antd's existing `extra` + MUI's existing layout).

## Plan 11 deliverables (complete)

- Three Node 24 alpine multi-stage Dockerfiles at the repo root: `Dockerfile.gateway` (apps/api), `Dockerfile.ms-auth`, `Dockerfile.ms-upload`. Each runs `corepack enable` + `yarn install --immutable` in the builder stage, then `yarn nx build <target>`, and copies `dist/` + `node_modules/` + `package.json` into the runtime stage.
- `docker-compose.yml` — orchestrates `redis` + `auth` + `upload` + `gateway` on an internal `icore` bridge network. Healthcheck on redis (`redis-cli ping`); MSes wait for redis healthy, gateway waits for redis + auth + upload. `AUTH_TRANSPORT=redis` + `UPLOAD_TRANSPORT=redis` injected directly so they always speak through the broker (closer to production than the default TCP transport). Only the gateway publishes a port (`3001:3001`).
- `.env.docker.example` — single env file consumed by all four services; documents provider creds for Supabase / Firebase / Cloudinary + OAuth client IDs + `CLIENT_ORIGIN` / `API_ORIGIN`.
- `.dockerignore` — excludes `node_modules`, `dist`, `.nx`, `.yarn/cache`, `.git`, `.husky`, `.changeset`, etc. so the build context stays small.
- `docs/runbooks/local-docker.md` — walks through `.env.docker` setup, `docker compose up --build`, troubleshooting, targeted rebuilds.
- CI — new `docker-build` matrix job in `.github/workflows/pipeline.yml`. Builds all three Dockerfiles in parallel on every push to `dev`/`main` using buildx + GitHub Actions cache. Push disabled — verify-only.
- **Out of scope (per spec):** no Postgres / Firestore / storage emulators, no SPA service, no traefik/TLS, no Helm. Consumers add what they need.

## Plan 12 deliverables (complete)

- `libs/shared/src/jobs.ts` — `ICORE_QUEUES` registry (`email` / `image-process` / `cleanup`) + typed `JobsMap` payload types. Exported from `@icore/shared`.
- `libs/jobs-client` (`@icore/jobs-client`) — `JobsClientService.enqueue<K extends keyof JobsMap>(name, data, opts?)` writes directly to Redis via BullMQ `Queue`. One `IORedis` connection per process; `Queue` instances cached per queue name. Closes both on `OnModuleDestroy`. `JOBS_REDIS_URL` defaults to `redis://localhost:6379`.
- `apps/microservices/jobs` — standalone Nest app (`createApplicationContext`, no HTTP). Three `Worker` classes (`EmailWorker`, `ImageProcessWorker`, `CleanupWorker`) implement `OnModuleInit` + `OnModuleDestroy` so they live for the process lifetime. Concurrency configurable via `JOBS_WORKER_CONCURRENCY` (default 5). Default handlers log + ack — consumers swap in real logic.
- `apps/api/src/app/admin` — `AdminModule` mounts `@bull-board/express` at `/api/admin/queues` via NestJS `MiddlewareConsumer`. Bull-board reads queue handles from `JobsClientService.getQueue(...)`. **Security caveat:** raw express middleware bypasses the global `AuthGuard`. Document that consumers must front bull-board with their own reverse-proxy auth (basic auth, Cloudflare Access, etc.) before exposing publicly. Better admin-gate lands when a Nest controller wraps the route — out of scope for v0.1.
- `Dockerfile.ms-jobs` — Node 24 alpine multi-stage build for the jobs MS, same pattern as auth/upload.
- `docker-compose.yml` — new `jobs` service + `JOBS_REDIS_URL` env entries on gateway and jobs containers.
- **CLI** — new `--jobs=bullmq|none` flag (default `none`). `removeJobsStack` deletes the MS, lib, gateway admin module, Dockerfile, and the `jobs:` block from `docker-compose.yml` when opted out.

### Jobs — usage

```ts
// Inject anywhere a NestJS provider lives (gateway, any MS)
import { JobsClientService } from '@icore/jobs-client';

@Injectable()
export class SignupHook {
  constructor(private readonly jobs: JobsClientService) {}

  async onUserSignup(email: string) {
    // Typed by JobsMap — wrong payload shape is a TS error
    await this.jobs.enqueue('email', {
      to: email,
      subject: 'Welcome',
      body: 'Glad you joined.',
    });

    // Delayed cleanup — runs in 24h
    await this.jobs.enqueue(
      'cleanup',
      { kind: 'expired-magic-links', olderThanMs: 86_400_000 },
      { delay: 86_400_000 },
    );
  }
}
```

```ts
// Worker (apps/microservices/jobs/src/app/workers/email.worker.ts) — replace the stub
async (job: Job<EmailJob>) => {
  await this.mailer.send({
    to: job.data.to,
    subject: job.data.subject,
    html: job.data.body,
  });
};
```

Admin queue dashboard: `http://localhost:3001/api/admin/queues` (front with reverse-proxy auth before exposing publicly — bull-board mounts as raw Express middleware and bypasses `AuthGuard`).

## Cross-links

- Detailed design + decision log → [`docs/superpowers/specs/2026-05-28-icore-design.md`](./superpowers/specs/2026-05-28-icore-design.md)
- Plan-by-plan build sequence → [`docs/superpowers/plans/`](./superpowers/plans/)
- Per-plan design notes (OAuth, payment, notes, docker-compose, BullMQ) → [`docs/superpowers/specs/`](./superpowers/specs/)
- Local docker stack runbook → [`docs/runbooks/local-docker.md`](./runbooks/local-docker.md)
- Day-to-day agent rules → [`AGENTS.md`](../AGENTS.md)
- Provider setup walk-throughs → [`AGENTS.md` § Provider-specific Setup](../AGENTS.md#provider-specific-setup)
