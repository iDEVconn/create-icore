# iCore — Bootstrap Scaffold for Nx + NestJS + React Projects

**Date:** 2026-05-28
**Status:** Approved (design) — extended by Plans 6.1–6.5 (templates, theme, magic-link, OAuth), 8 (DBStrategy), 9 (Payment), 10 (Notes sample), 11 (docker-compose), 12 (BullMQ).
**Author:** Vladimir Tkach

## Purpose

iCore is a reusable scaffold that lets new projects start from a hardened baseline matching the patterns already proven in `warranty` and `ui-main`. It ships infrastructure only — no business domain (beyond a notes demo) — so consumers add their own products/invoices/whatever on top.

Consumers bootstrap a new project via `npm init @idevconn/icore <name>` (or `npx @idevconn/create-icore <name>`), pick providers at prompt time, and get a working monorepo with gateway + microservices (auth + upload + optional payment + optional jobs + notes sample), a shadcn / antd / mui client, CASL authorization, i18n (en/ru/he with RTL), and an optional `docker compose up` local dev stack.

## Goals

- One command to bootstrap a new project end-to-end.
- Swap auth and storage providers via environment variables, with no code changes.
- Microservices architecture from day one — gateway routes message-pattern calls to dedicated services for auth and storage.
- Shared CASL `defineAbilitiesFor` between client and server so authorization rules cannot drift.
- Run locally with TCP transport (no broker required); flip to Redis or NATS in production via env.

## Non-Goals

- No domain entities. No products, invoices, subscriptions, audit logs, schedulers, webhooks.
- No deploy pipeline. Consumers add their own CI/CD.
- No multi-tenant scaffolding. Single-tenant baseline only.
- No published per-provider npm packages (Approach C rejected as premature).

## Architecture

### Monorepo Layout

```
icore/
├── apps/
│   ├── api/                         # NestJS gateway
│   ├── microservices/
│   │   ├── auth/                    # AuthStrategy consumer
│   │   └── upload/                  # StorageStrategy consumer
│   └── client/                      # Vite + React 19 + shadcn
├── libs/
│   ├── shared/                      # types, CASL defineAbilitiesFor, strategy contracts, transport helper
│   ├── auth-strategies/
│   │   ├── supabase/
│   │   └── firebase/
│   ├── storage-strategies/
│   │   ├── supabase/
│   │   ├── firebase/
│   │   └── cloudinary/
│   ├── auth-client/                 # gateway → auth MS client (NestJS module)
│   └── upload-client/               # gateway → upload MS client (NestJS module)
├── tools/
│   └── create-icore/                # npx CLI
├── docker-compose.yml               # gateway + ms (+ optional redis/nats)
├── .env.example
├── nx.json
├── package.json
└── .yarnrc.yml                      # yarn 4, nodeLinker: node-modules
```

### Stack Decisions

| Concern         | Decision                                                               |
| --------------- | ---------------------------------------------------------------------- |
| Monorepo        | Nx 22.7                                                                |
| Package manager | yarn 4 (nodeLinker: node-modules — Nx generators need it)              |
| API framework   | NestJS 11                                                              |
| API shape       | Gateway + microservices (TCP default, configurable)                    |
| MS transport    | TCP (default) / Redis / NATS via `*_TRANSPORT` env                     |
| Client          | Vite + React 19 + TypeScript strict                                    |
| Styling         | Tailwind 4 + shadcn/ui                                                 |
| Router          | TanStack Router (file-based)                                           |
| Data fetching   | TanStack Query                                                         |
| Client state    | Zustand (persist)                                                      |
| i18n            | i18next + react-i18next; en/ru/he with RTL auto                        |
| Authorization   | CASL.js (`@casl/ability` + `@casl/react`), shared `defineAbilitiesFor` |
| Unit tests      | Vitest (client + CLI) / Jest (api + ms)                                |
| E2E             | Playwright (smoke only — register → upload → signed-url)               |

### Strategy Pattern (the Core Idea)

Both auth and storage hide behind a single interface in `libs/shared`. Concrete implementations live in their own libs and are wired into NestJS via a factory provider that reads the provider name from `ConfigService`.

#### Auth contract

```ts
// libs/shared/src/strategies/auth.ts
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<{ uid: string; email?: string; role?: string }>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  setRole(uid: string, role: string): Promise<void>;
}
```

#### Storage contract

```ts
// libs/shared/src/strategies/storage.ts
export interface StorageRef {
  bucket: string;
  path: string;
}
export interface FileInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface StorageStrategy {
  upload(userId: string, file: FileInput): Promise<StorageRef>;
  remove(userId: string, ref: StorageRef): Promise<void>;
  getSignedUrl(userId: string, ref: StorageRef, ttlSec?: number): Promise<string>;
  list(userId: string, prefix?: string): Promise<StorageRef[]>;
}
```

#### Factory wiring (NestJS module)

```ts
providers: [
  {
    provide: 'AuthStrategy',
    useFactory: (cfg: ConfigService) => {
      switch (cfg.get('AUTH_PROVIDER')) {
        case 'supabase':
          return new SupabaseAuthStrategy(cfg);
        case 'firebase':
          return new FirebaseAuthStrategy(cfg);
        default:
          throw new Error('AUTH_PROVIDER missing');
      }
    },
    inject: [ConfigService],
  },
];
```

Same pattern for `'StorageStrategy'` in the upload MS.

#### Reuse of existing iDEVconn packages

- `@idevconn/supabase` (v0.12+) is the underlying SDK wrapper for the `SupabaseAuthStrategy` in Plan 2. It already provides `AuthService` (password login, OAuth, magic link, `getCurrentUser`, `onAuthStateChange`) plus `createTableApi<T>()` and unified `SupabaseApiError` handling. The icore `SupabaseAuthStrategy` is a thin adapter that exposes the icore `AuthStrategy` shape over `@idevconn/supabase`'s `AuthService` — do not call `@supabase/supabase-js` directly from icore code.
- `@idevconn/llm-router` (v0.4+) is the architectural reference for this strategy pattern (`LlmRegistry` + `LlmStrategy` + provider-as-subpath-export model). icore's auth/storage strategies follow the same shape so that when LLM features are added later (currently out of scope) `@idevconn/llm-router` can be wired in unchanged. No icore module imports it in v0.1.0.

### Transport Helper

```ts
// libs/shared/src/transport.ts
export function buildTransport(prefix: string): ClientOptions {
  switch (process.env[`${prefix}_TRANSPORT`] ?? 'tcp') {
    case 'tcp':
      return {
        transport: Transport.TCP,
        options: { host: env(`${prefix}_HOST`), port: +env(`${prefix}_PORT`) },
      };
    case 'redis':
      return { transport: Transport.REDIS, options: { url: env(`${prefix}_REDIS_URL`) } };
    case 'nats':
      return {
        transport: Transport.NATS,
        options: { servers: env(`${prefix}_NATS_URL`).split(',') },
      };
    default:
      throw new Error(`Unknown transport: ${process.env[`${prefix}_TRANSPORT`]}`);
  }
}
```

Gateway uses `buildTransport('AUTH')` and `buildTransport('UPLOAD')`. Each MS bootstraps with the matching block in its `main.ts`. Same env contract on both sides → no per-transport branching elsewhere.

### Env Layering

Three concentric env layers, owned by different parts of the system:

| Layer                | Owner             | Variables                                                                                                                                                                                                       | Where read                                                 |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Transport wiring     | gateway + each MS | `AUTH_TRANSPORT`, `AUTH_HOST`, `AUTH_PORT`, `AUTH_REDIS_URL`, `AUTH_NATS_URL`, `UPLOAD_TRANSPORT`, `UPLOAD_HOST`, …                                                                                             | `buildTransport(prefix)` in `libs/shared/src/transport.ts` |
| Provider selection   | per microservice  | `AUTH_PROVIDER` (`supabase` \| `firebase`), `STORAGE_PROVIDER` (`supabase` \| `firebase` \| `cloudinary`)                                                                                                       | `useFactory` in the MS module                              |
| Provider credentials | concrete strategy | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`; `FB_ADMIN_*` (service-account JSON fields); `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | strategy constructor via `ConfigService` injection         |

**`libs/shared` is env-free.** It only exports contracts (`AuthStrategy`, `StorageStrategy`), the contract-test harness, in-memory fakes, and the transport helper. Concrete provider code lives in `libs/auth-strategies/*` and `libs/storage-strategies/*`; env IO happens at the MS module boundary.

**MS bootstrap pattern (mirrors `ui-main/apps/microservices/upload/src/app/upload.module.ts`):**

```ts
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [
        join(process.cwd(), 'apps/microservices/upload/.env'),
        join(process.cwd(), '.env'),
      ],
      isGlobal: true,
    }),
  ],
  providers: [
    {
      provide: 'StorageStrategy',
      useFactory: (cfg: ConfigService) => {
        switch (cfg.getOrThrow('STORAGE_PROVIDER')) {
          case 'supabase':
            return new SupabaseStorageStrategy(cfg);
          case 'firebase':
            return new FirebaseStorageStrategy(cfg);
          case 'cloudinary':
            return new CloudinaryStorageStrategy(cfg);
          default:
            throw new Error(`Unknown STORAGE_PROVIDER`);
        }
      },
      inject: [ConfigService],
    },
    UploadService,
  ],
})
export class UploadModule {}
```

**Per-MS `.env` lives at `apps/microservices/<name>/.env`** (gitignored, with a sibling `.env.example` checked in). The MS process loads its own .env on boot; the gateway has its own `apps/api/.env` for transport wiring (no provider credentials in the gateway).

### Gateway (apps/api)

- Global `AuthGuard` extracts Bearer token, calls `auth-client.verify(token)` over chosen transport, attaches `req.user`.
- `@Public()` decorator skips guard (login, register, refresh, webhooks).
- CASL `AbilityGuard` + `@CheckAbility(action, subject)` for admin routes.
- ThrottlerModule with `auth-burst` (10 / 60s) on auth routes.
- Routes:
  - `POST /api/auth/{login,register,refresh,logout}` → auth MS.
  - `GET /api/profile` → reads `req.user`, hydrates from auth MS.
  - `POST /api/storage/upload` → `FileInterceptor` → upload MS via `upload-client`.
  - `GET /api/storage/signed-url?ref=storage://bucket/path` → `assertOwnership(ref, req.user.id)` → upload MS.
  - `DELETE /api/storage/remove` → `assertOwnership` → upload MS.

### Auth MS (apps/microservices/auth)

Message patterns:

| Pattern         | Payload               | Returns                  |
| --------------- | --------------------- | ------------------------ |
| `auth.verify`   | `{ token }`           | `{ uid, email?, role? }` |
| `auth.login`    | `{ email, password }` | `AuthSession`            |
| `auth.register` | `{ email, password }` | `AuthSession`            |
| `auth.refresh`  | `{ refreshToken }`    | `AuthSession`            |
| `auth.setRole`  | `{ uid, role }`       | `void`                   |

Injects `AuthStrategy` from factory. No direct provider SDK usage in handlers — every call goes through the strategy.

### Upload MS (apps/microservices/upload)

Message patterns:

| Pattern             | Payload                    | Returns        |
| ------------------- | -------------------------- | -------------- |
| `storage.upload`    | `{ userId, file }`         | `StorageRef`   |
| `storage.remove`    | `{ userId, ref }`          | `void`         |
| `storage.signedUrl` | `{ userId, ref, ttlSec? }` | `string`       |
| `storage.list`      | `{ userId, prefix? }`      | `StorageRef[]` |

Validates MIME allowlist and max size **before** the strategy call. Per-bucket config (`MAX_INVOICE_SIZE_KB`, `ALLOWED_MIME_INVOICES`, etc.) read at module init.

### Client UI library — bootstrap-time choice (locked)

The client UI library is NOT runtime-swappable. Auth and storage abstract over I/O (clean interfaces). UI abstracts over visual+UX+ergonomics — too deep to hide behind one interface without a leaky middleware layer. The choice happens once at scaffolding time, via the `--ui=shadcn|antd|mui` flag of `npx @idevconn/create-icore`.

**Layout (Plan 6):**

```
apps/
├── templates/
│   ├── client-shadcn/    # full Vite + React 19 + TanStack Router + shadcn/Tailwind 4
│   ├── client-antd/      # full Vite + React 19 + TanStack Router + Ant Design 6
│   └── client-mui/       # full Vite + React 19 + TanStack Router + MUI 6
└── client/               # NOT shipped here — populated by the CLI when scaffolding a new project
```

All three templates share the same routes, the same `api/client.ts` wiring, the same Zustand auth store, the same i18n setup, the same CASL `<Can>` provider. They differ only in the components/pages layer (login form, dashboard, profile) and their tailwind/antd/mui-specific deps.

**CLI behaviour (Plan 7):** `create-icore` prompts UI choice → copies the chosen `apps/templates/client-<ui>/` tree to the new project's `apps/client/` → removes `apps/templates/` from the new project. The new project ships with one client; templates are not preserved in consumer projects.

**Maintenance:** every UI feature added during Plan 6 onward lands in all three templates in lockstep. CI matrix in `create-icore`'s own repo builds + tests all three templates per push so drift is caught immediately.

### Client surface — pages + layouts (locked)

Every template ships the same route tree. Library differences live below the route layer (component implementations + theming).

| Route                  | Auth                                           | Library-agnostic?               | Notes                                                                                                                                                                                                  |
| ---------------------- | ---------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/` (landing)          | Public                                         | ✅ Yes — plain HTML/CSS + React | Renders the workspace `package.json` version and the versions of the key installed deps (NestJS, React, Vite, the chosen UI lib, the chosen auth/storage providers). Identical across all 3 templates. |
| `/login`               | Public                                         | ❌ Library-specific             | Email/password form posted to `POST /api/auth/login`                                                                                                                                                   |
| `/_dashboard` (layout) | Protected (`beforeLoad` redirects to `/login`) | ❌ Library-specific             | Two-pane shell — header + collapsible sider menu + content outlet + footer. Equivalent to `ui-main/apps/client/src/layouts/mainLayout.tsx`.                                                            |
| `/_dashboard/` (index) | Protected                                      | ❌ Library-specific             | Dashboard landing — welcome card, stats placeholder                                                                                                                                                    |
| `/_dashboard/profile`  | Protected                                      | ❌ Library-specific             | Profile form using `useDraft(isDirty)` from `@idevconn/use-draft` to block navigation on unsaved changes.                                                                                              |

**`PageLayout` wrapper** — every protected route renders its body inside a `<PageLayout title action subject>` component (template-local) that:

1. Wraps the body in `<Can I={action} a={subject}>` from `@casl/react` — if denied, shows the template's `AccessDeniedPage`.
2. Shows the page title + optional description + `extra` slot for action buttons (matches `ui-main/apps/client/src/layouts/page.layout.tsx`).
3. Resets the global dirty flag on unmount via `useDraft(false)`.
4. Shows the loading spinner from the template's loading store (Zustand).

All three templates ship a `PageLayout` with the same prop signature; bodies are library-specific.

**Shared (template-agnostic) pieces** — landed in libs so all three templates pull them in unchanged:

- `defineAbilitiesFor` + `AppAbility` from `@icore/shared` (already done in Plan 1).
- `@idevconn/use-draft` for the dirty-form pattern. (Same one warranty ships; private npm.)
- API client wiring (`@idevconn/api-client` for token refresh + 401 handling), Zustand auth store, React Query, i18next setup. The wiring code is duplicated across templates _only_ where library-specific bits sit (e.g., the notification host) — bare logic lives in shared template helpers.

**`AccessDeniedPage`** — each template ships its own variant (different visual style); same component name + same export.

**`MainLayout` notification host** — antd uses `notification.useNotification()`, mui uses Snackbar via a provider, shadcn uses `<Toaster />` from `sonner`. Each template's `MainLayout` mounts its host once; downstream code calls a `useNotify()` hook with the same `success/error/info/warning` signature so app code never branches on the library.

### Client (apps/client)

```
src/
├── main.tsx                 # bootstrap: i18n, QueryClient, AbilityProvider, Router
├── routes/                  # TanStack Router file-based
│   ├── __root.tsx
│   ├── _public/login.tsx
│   └── _dashboard/
│       ├── route.tsx        # beforeLoad: auth gate, redirect to /login on miss
│       ├── index.tsx
│       └── profile.tsx
├── api/client.ts            # fetch wrapper, auto token refresh, ApiError(status, body)
├── stores/auth.ts           # Zustand + persist
├── queries/                 # React Query hooks
├── abilities/               # <AbilityProvider>, re-export of <Can>
├── components/              # shadcn primitives + app components
├── i18n/
│   ├── index.ts
│   └── locales/{en,ru,he}.json
├── lib/utils.ts             # shadcn cn()
└── globals.css              # tailwind v4 directives
```

- Frontend never talks to a provider SDK. Auth and storage requests go to the gateway.
- Language saved to localStorage (`icore-lang`). RTL auto-applied via `document.documentElement.dir`.
- `<Can I="manage" a="all">` from `@casl/react` wraps admin UI.

### @idevconn/create-icore CLI (tools/create-icore)

Prompts:

```
? Project name: my-app
? Auth provider: (Supabase / Firebase)
? Storage provider: (Supabase / Firebase / Cloudinary)
? MS transport: (TCP / Redis / NATS)
? Init git? (Y/n)
```

Steps:

1. Copy template (this repo, minus `.git`, `node_modules`, `tools/create-icore/dist`) to `<name>/`.
2. Rewrite package names, replace `icore` placeholders in package.json, README, env templates.
3. Write `.env` with selected `AUTH_PROVIDER`, `STORAGE_PROVIDER`, `*_TRANSPORT`, and stubbed provider credentials.
4. `yarn install`.
5. `git init` + initial commit `chore: bootstrap from icore`.
6. Print next steps (fill provider keys, run `yarn dev`).

Built with `tsup`, distributed as `@idevconn/create-icore` npm package (scoped under the same `@idevconn` org used by `@idevconn/api-client`, `@idevconn/use-draft`, etc.). Tested with Vitest (CLI snapshot tests + dry-run integration test).

**Naming locked:**

- GitHub repo: `iDEVconn/create-icore` (entire monorepo lives here)
- npm CLI: `@idevconn/create-icore` (invoked via `npm init @idevconn/icore my-app` per npm `create-<name>` convention)
- Internal workspace libs keep `@icore/*` scope (`@icore/shared`, `@icore/auth-supabase`, `@icore/auth-firebase`, `@icore/auth-client`, …) — published only if/when consumers need them; private inside the monorepo until then.

## Testing Strategy

### Unit tests

- **Strategy unit tests** live next to each strategy. Mock provider SDKs at module boundary.
- **Strategy contract tests** in `libs/shared/src/strategies/__tests__/contract.ts` define a single behavioural suite (`runAuthContract(factory)`, `runStorageContract(factory)`) that every concrete strategy runs. A strategy that passes its own unit tests but fails the contract suite indicates drift between providers — the test fails the build.
- **Gateway/MS handlers**: standard NestJS Jest tests with mocked clients/strategies.

### E2E smoke

Spawns gateway + both microservices over TCP with **fake strategies** (in-memory implementations of `AuthStrategy` and `StorageStrategy`). Walks:

1. `POST /api/auth/register` → 200 with session.
2. `POST /api/storage/upload` (multipart) → 200 with `StorageRef`.
3. `GET /api/storage/signed-url?ref=...` → 200 with URL.
4. `DELETE /api/storage/remove` → 204.

No real Supabase/Firebase/Cloudinary calls in CI.

### CI matrix

`AUTH_PROVIDER × STORAGE_PROVIDER` cross-product runs unit + contract tests for each pair (2 × 3 = 6 combos). Build job runs once. E2E smoke runs once with TCP + fake strategies.

## Migration Order

Each phase ships a green build and merges as its own PR onto `dev`. `main` stays untouched until v0.1.0 is fully assembled.

| Phase | Deliverable                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Skeleton: `nx init`, yarn 4 PnP, base tsconfig, eslint, prettier, githooks, root `AGENTS.md`                                                |
| 1     | `libs/shared`: types, `defineAbilitiesFor`, strategy contracts, `buildTransport`, contract test suite                                       |
| 2     | Auth MS + Supabase auth strategy + `libs/auth-client`; contract suite passes for Supabase                                                   |
| 3     | Gateway with `AuthGuard`, `/auth/*` routes, throttler, CASL `AbilityGuard`; E2E register→login→`/me`                                        |
| 4     | Firebase auth strategy — same contract suite passes, CI matrix expands                                                                      |
| 5     | Upload MS + Supabase storage strategy + `libs/upload-client` + gateway `/storage/*` with `assertOwnership`                                  |
| 6     | Firebase + Cloudinary storage strategies; CI matrix completes 2×3                                                                           |
| 7     | Client shell: Vite + shadcn + Tailwind + TanStack Router/Query + Zustand + i18n + CASL; Playwright smoke                                    |
| 8     | `tools/create-icore` CLI (published as `@idevconn/create-icore`) with `tsup` build and Vitest tests                                         |
| 9     | Docs (`docs/architecture.md`, `docs/strategies/*.md`, `docs/runbooks/swap-provider.md`); publish CLI; tag v0.1.0; manual merge `dev → main` |

## Open Questions

None. All key decisions are locked.

## Out of Scope (Future Work)

- Subscriptions / entitlements layer (would copy the `@idevconn/isubscribe-entitlements` integration from `warranty`).
- AI chat / RAG widgets.
- Audit log module.
- Scheduler / cron jobs.
- Webhooks module.
- Admin UI scaffold.
- Per-provider published packages (Approach C) — revisit once strategy contracts are stable.
