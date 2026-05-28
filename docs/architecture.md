# icore Architecture

High-level view of how icore is assembled. Detailed design lives in `docs/superpowers/specs/2026-05-28-icore-design.md`; build plans in `docs/superpowers/plans/`.

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

## Layout

```
icore/
├── apps/
│   ├── api/                 # NestJS gateway (only public surface)
│   ├── microservices/
│   │   ├── auth/            # AuthStrategy consumer
│   │   └── upload/          # StorageStrategy consumer
│   └── client/              # Vite + React 19 + shadcn
├── libs/
│   ├── shared/              # types, CASL, strategy contracts, transport helper
│   ├── auth-strategies/{supabase,firebase}/
│   ├── storage-strategies/{supabase,firebase,cloudinary}/
│   ├── auth-client/         # gateway → auth MS client (NestJS module)
│   └── upload-client/       # gateway → upload MS client (NestJS module)
└── tools/
    └── create-icore/        # npx CLI source
```

## Shared library (`libs/shared`) — current contents

- `defineAbilitiesFor(user)` — single source of truth for CASL rules. Used by both server (`AbilityGuard`) and client (`<AbilityProvider>`).
- `AuthStrategy` / `StorageStrategy` — provider-agnostic contracts in `src/strategies/`.
- `runAuthContract(name, factory)` / `runStorageContract(name, factory)` — re-runnable Vitest suites; every concrete strategy lib runs them.
- `FakeAuthStrategy` / `FakeStorageStrategy` — in-memory reference implementations. Pass the contract suites, double as test stand-ins for the future gateway/MS smoke E2E.
- `buildTransport(prefix)` — reads `${prefix}_TRANSPORT` env (`tcp` | `redis` | `nats`) and returns NestJS `ClientOptions`. Same helper on gateway and inside each MS `main.ts` so the transport choice is environment-driven.

## Strategy pattern

Both auth and storage hide behind a single interface. NestJS module wires a factory provider that reads the provider name from `ConfigService` and returns the concrete strategy. Three env layers:

| Layer                | Owner             | Example vars                                                                                              |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| Transport wiring     | gateway + each MS | `AUTH_TRANSPORT`, `AUTH_HOST`, `AUTH_PORT`, `UPLOAD_TRANSPORT`, …                                         |
| Provider selection   | per microservice  | `AUTH_PROVIDER` (`supabase` \| `firebase`), `STORAGE_PROVIDER` (`supabase` \| `firebase` \| `cloudinary`) |
| Provider credentials | concrete strategy | `SUPABASE_*`, `FB_ADMIN_*`, `CLOUDINARY_*`                                                                |

`libs/shared` is env-free. Env IO happens at the MS module boundary.

### Env keys per app / MS (v0.1.0)

| File                             | Keys                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
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
- `apps/templates/client-shadcn-e2e` — Playwright smoke suite (4 cases): landing heading contains `icore v`, login form labels visible, `/dashboard` and `/profile` redirect to `/login` when unauthenticated. NOTE: browsers cannot install on Ubuntu 26.04-x64; tests run on a supported CI runner only.
- Antd + MUI templates tracked for Plans 6.1 + 6.2 — same shared lib, same route tree, library-specific layout + form components.

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

## Plan 7 deliverables (active)

- `tools/create-icore/` — `@idevconn/create-icore` CLI built with tsup. Entry: `dist/cli.js`. Templates baked into `tools/create-icore/templates/` by a build-time snapshot of the current monorepo source.
- Interactive prompts via `@clack/prompts` 1.4+: project name → auth provider → db provider (records the choice, mirrors auth in v0.1.0) → upload provider (with `none` opt-out) → UI library → MS transport → init git → run install.
- Non-interactive via flags: `--auth=supabase|firebase`, `--db=supabase|firebase`, `--upload=supabase|firebase|cloudinary|none`, `--ui=shadcn|antd|mui`, `--transport=tcp|redis|nats`, `--no-git`, `--no-install`. The legacy `--storage` flag is a deprecated alias that warns and maps to `--upload`.
- `scaffold()` copies templates, rewrites `.env.example` → `.env` per provider selection, removes the upload stack when `--upload=none`, runs `git init` + initial commit + `yarn install`.
- 18 tests cover env rewriting, flag parsing, deprecated-storage alias, upload=none stack removal, and full dry-run integration smoke.
- Published to npm via OIDC trusted publishing + changesets (see `.github/workflows/release.yml`).

## Cross-links

- Detailed design + decision log → `docs/superpowers/specs/2026-05-28-icore-design.md`
- Plan-by-plan build sequence → `docs/superpowers/plans/`
- Day-to-day agent rules → `AGENTS.md`
- Provider setup walk-throughs → `AGENTS.md` § Provider-specific Setup
