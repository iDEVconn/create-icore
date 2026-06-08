# @idevconn/create-icore

## 0.7.2

### Patch Changes

- 2ec8463: Fix npm scaffold installs for PayPal/payment projects by keeping the generated API on Express 5.

## 0.7.1

### Patch Changes

- 3918b5d: Fix client-shadcn build: move Google Fonts @import before @import 'tailwindcss' to satisfy PostCSS @import ordering rule.

## 0.7.0

### Minor Changes

- 7fc97d7: Enterprise antd + MUI templates: add signup + confirm-email flow, enterprise green theme, split-panel login layout, @/main alias standardization across all templates.
- 33e9cdb: Enterprise shadcn UI template: fix i18n namespace wrapping, add ru/he translations, add signup + confirm-email flow, OLED dark theme (Plus Jakarta Sans, green accent), enterprise split-panel login, collapsed sidebar with active highlights.

### Patch Changes

- 2c29eac: Fix ESLint issues, update dependencies, and add MongoDB configuration examples to .env templates.
- af27cae: Fix MongoDB review bugs and wire GridFS download: guard model re-registration, fix expiresIn calculation, escape regex in list(), replace `as never` cast, drop non-existent uuid v14 dep. Add downloadBuffer to StorageStrategy interface + MongoDbStorageStrategy impl + upload MS handler + UploadClientService method + GET /api/storage/file gateway endpoint so MongoDB storage downloads actually work.
- 5ad7911: Add MongoDB scaffold smoke combos (Layer A typecheck in `pipeline.yml` and Layer B install+boot in `scaffold-smoke-matrix.yml`) and fix the `MongooseModule.forRootAsync` strip regex so non-MongoDB combos no longer emit broken `app.module.ts` (the non-greedy `}),` match stopped at the inner `useFactory` return).

## 0.6.3

### Patch Changes

- 5c0a90f: test: scaffold stubs with real UI deps; assert selected UI deps present in output; add mandatory prettier rule to AGENTS.md

## 0.6.2

### Patch Changes

- 07b7c53: fix(deps): isolate optional app deps into workspace package.json files

  Each optional app (jobs, notes, payment MSes; antd/mui/shadcn client templates) now
  declares only its own runtime deps in a dedicated package.json. Removed 24 orphaned deps
  from the root package.json that were always installed regardless of user choices.
  Also adds missing workspace globs for apps/microservices/_, apps/templates/_,
  libs/db-strategies/\* and fixes GATEWAY_SERVICES baseline.

## 0.6.1

### Patch Changes

- 1736a3b: Fix pnpm and yarn install failures in generated projects.
  - **pnpm:** `pnpm 9+` no longer reads `"workspaces"` from `package.json` (requires `pnpm-workspace.yaml`) and ignores the `"pnpm"` key (settings moved to `pnpm-workspace.yaml`). Scaffold now creates `pnpm-workspace.yaml` with the workspace `packages` list and `onlyBuiltDependencies`, and removes the dead `"pnpm"` key from the generated `package.json`.
  - **yarn:** `packageManager` was pinned to `yarn@4.5.0` in the template. Scaffold now reads the actual `yarnPath` from `.yarnrc.yml` and writes the matching version (e.g. `yarn@4.15.0`), keeping them in sync automatically.
  - **Smoke test:** yarn 4 auto-enables `--immutable` in CI environments, but a freshly scaffolded project has an empty `yarn.lock`. The Layer B smoke now passes `--no-immutable` for the first install so the lockfile can be populated.

## 0.6.0

### Minor Changes

- 6aecc38: Add MQTT, RabbitMQ (rmq) and Kafka as microservice transport options, alongside the existing tcp / redis / nats.
  - `--transport=mqtt|rmq|kafka` (and the interactive picker) now scaffold the matching `*_TRANSPORT` value, uncomment the right broker vars in every `.env` (`*_MQTT_URL`; `*_RMQ_URL` + `*_RMQ_QUEUE`; `*_KAFKA_BROKERS` + `*_KAFKA_CLIENT_ID`), and add the driver dep (`mqtt`; `amqplib` + `amqp-connection-manager`; `kafkajs`) to the generated `package.json`.
  - `buildTransport()` gained the three cases with the same crash-resilience contract as redis/nats: the broker driver reconnects in the background and a broker that's down on boot is caught by `bootstrapMicroservice()` (banner + retry in dev, fail-fast in prod) instead of exiting.
  - All six are message-pattern transports, so `@MessagePattern` controllers and `ClientProxy.send/emit` work unchanged. **gRPC is intentionally not offered** — it requires `.proto` contracts + `@GrpcMethod` + `ClientGrpc`, which is incompatible with the message-based gateway↔MS layer (tracked as a separate epic).

### Patch Changes

- b5ced31: Fix the generated client failing to typecheck: `TS2304: Cannot find name 'window'`/`'document'` and wrong route link targets.
  - **DOM lib:** the client `tsconfig.json` (all three UI variants) set no `lib`, so it inherited the base `["ES2022"]` — no DOM. `window`/`document`/DOM types were undefined under `tsc`/IDE (Vite's build masked it). Added `lib: ["ES2022", "DOM", "DOM.Iterable"]`.
  - **Route paths:** links and `navigate({ to })` used `/_dashboard/<x>`, but `_dashboard` is a pathless layout — the real URL (and the generated route union) is `/<x>`. Fixed every `to="/_dashboard/…"`, `navigate({ to: '/_dashboard/dashboard' })`, and the e2e `page.goto('/_dashboard/…')` to the correct `/dashboard` · `/notes` · `/profile`, across shadcn/antd/mui. This was both a type error and broken navigation.

  All three client templates now `tsc --noEmit` clean.

- 3929a72: Fix dangling client-nav icon after `--example=none`. `removeNotesStack` stripped the notes nav from `LayoutSider` using hardcoded `to="/_dashboard/notes"` matches, so once the link targets moved to the pathless `/notes` the prune missed the nav block while still removing the icon import — leaving a dangling `FileTextOutlined` (antd), `StickyNote` (shadcn) or `NoteOutlinedIcon` (mui). The matches are now path-agnostic (`/_dashboard/notes` or `/notes`) and the antd entry is matched by a regex rather than a brittle exact string, so the icon import and the nav block are removed together across all three UI variants.
- 8873fd0: Replace deprecated `FormEvent` with `SyntheticEvent<HTMLFormElement>` in all generated client templates.

  `React.FormEvent` (and its parameterized form `React.FormEvent<HTMLFormElement>`) are deprecated in React 19 — "FormEvent doesn't actually exist" per the React type declarations. The generated client had four occurrences across shadcn (bare `FormEvent` imported from react) and mui (`React.FormEvent<HTMLFormElement>`) in form submit handlers.

  Replaced with `SyntheticEvent<HTMLFormElement>` (named import from react), which is not deprecated, carries `preventDefault()`, and types the form element correctly.

- dedb01e: Fix `TS2792: Cannot find module 'vitest'` (and `TS5070`) when typechecking the generated gateway/microservice **test** configs.

  The app `tsconfig.json` (the base that `tsconfig.spec.json` extends) set no `module`/`moduleResolution`, so the spec config fell back to classic resolution — which can't read vitest's `exports`-only type declarations, and is missing `experimentalDecorators` for the NestJS source the specs pull in. `tsc -p tsconfig.spec.json` (and the IDE) failed across `apps/api`, `apps/microservices/auth`, `apps/microservices/upload`; `nx test` masked it because vitest runs via esbuild, not `tsc`.

  Each app `tsconfig.json` now carries the same NestJS compiler options as its build config (`module`/`moduleResolution: node16`, `experimentalDecorators`, `emitDecoratorMetadata`, `target: es2021`), so the spec config inherits a working setup and resolves vitest.

  The scaffold smoke (Layer A) now also typechecks each app's `tsconfig.spec.json`, so this class of regression is caught before publish.

## 0.5.2

### Patch Changes

- 225c840: Fix `notes-client` / `jobs-client` / `payment-client` / `firebase-admin` failing to build in a generated project under npm/pnpm.

  These libs were generated with `module: commonjs` and no explicit `moduleResolution`, so TypeScript defaulted to classic `node10`, which cannot read a package's `exports` map. `@casl/ability@7` (and other modern packages) expose their type declarations only via `exports`, so compiling `@icore/shared`'s `ability.ts` through one of these libs failed with `TS7016: Could not find a declaration file for module '@casl/ability'`.

  iCore's own `nx build` masked it (nx resolves `@icore/shared` to its built `.d.ts`), but a freshly scaffolded project — and a raw `tsc` — compiles the source and broke.

  Aligned the four libs to `module: node16` + `moduleResolution: node16`, matching `shared` and the other client/strategy libs that were already correct. No runtime change; emit stays CommonJS.

- 6880ff7: Move the strategy contract-test harness out of the production `@icore/shared` surface so generated projects build under any tsconfig.

  The `runAuthContract` / `runStorageContract` / `runDBContract` harness used Vitest globals (`describe`/`it`/`expect`) but lived in `strategies/contract/*.ts` as ordinary source, re-exported from the prod `index.ts`. Any build or typecheck without `vitest/globals` in `types` failed with `TS2304: Cannot find name 'expect'/'it'` — `nx build shared` only passed because its `tsconfig.lib.json` injected `vitest/globals`, a fragile hack.
  - Harness moved to `strategies/__tests__/*.contract.unit.test.ts` (project test-naming convention) → excluded from the library build like any test file; the `vitest/globals` hack is removed from `tsconfig.lib.json`.
  - It is no longer exported from the prod `index.ts`; tests import it from a new `@icore/shared/testing` subpath (mirrors `@icore/shared/client`).
  - Vitest is configured not to run the pure-harness files (they only export suites, no top-level tests); the concrete `fake-*` and per-provider contract tests invoke them.

  Result: the shipped `@icore/shared` carries zero test DSL, and the generated workspace compiles regardless of which tsconfig builds it.

## 0.5.1

### Patch Changes

- 064a89a: Unify Firebase Admin initialization and consume the full service-account env contract.
  - New `@icore/firebase-admin` lib exports a single `getFirebaseAdmin(cfg)` that initialises the default Admin app exactly once (guarded on `admin.apps`) and feeds the **complete** `FB_ADMIN_*` service-account JSON to `cert()` — the full set Firebase emits in its console config, not just project_id/client_email/private_key.
  - The auth, upload (Firebase storage) and notes (Firestore) microservices now call `getFirebaseAdmin(cfg)` instead of each duplicating an `initializeApp({ credential: cert(...) })` block — one init, no drift.
  - `REQUIRED_ENV` for every Firebase consumer now lists all 11 `FB_ADMIN_*` keys (shared `FIREBASE_ADMIN_REQUIRED_ENV`), so a missing field surfaces the boxed banner instead of a partial credential.
  - Scaffold prunes `libs/firebase-admin` (and its alias/deps) when no provider uses Firebase, and strips the `@icore/firebase-admin` import + `firebase`/`firestore` REQUIRED_ENV entries from each microservice that doesn't.

- 53a210a: Generated projects now build and run out of the box:
  - `pmRun()` — npm needs the `run` prefix for custom scripts (`npm run dev`, not `npm dev`); yarn/pnpm don't. Fixes wrong run hints across all package-manager paths.
  - Strategy pruning rewritten: auth/upload/notes modules use a uniform function-pair shape (`makeSupabaseAuth`/`makeFirebaseAuth`, `makeSupabase/Firebase/CloudinaryStorage`, `makeSupabaseDB`/`makeFirestoreDB`) and the pruner drops the unchosen factory functions + collapses the provider branch to a single `return make<Chosen>(cfg);`. Eliminates `TS2304: Cannot find name 'makeFirebaseStrategy' / admin / FirestoreDBStrategy` dangling references in scaffolded microservices.
  - `.gitignore` shipped so git no longer stages `node_modules` / the vendored yarn binary for npm/pnpm projects.
  - Microservices no longer crash on missing `.env` / infra: payment shows a boxed banner instead of throwing on absent PayPal creds, jobs survives a down Redis (ioredis `error` handler + retry), and the gateway no longer crashes on missing PAYMENT/NOTES transport env.

- fe17469: Generated projects survive a redis/nats microservice transport whose broker isn't up — only `tcp` was self-contained before.
  - **NATS dependency:** scaffold now adds the `nats` driver to the root `package.json` when the NATS transport is chosen. It's an optional peer dep of `@nestjs/microservices`, so without it a nats-transport project crashed on boot with "the nats package is missing".
  - **No crash on a down broker:** microservice bootstraps now go through a shared `bootstrapMicroservice()` helper. NestJS rejects `app.listen()` on the _initial_ broker connect failure (the ioredis/nats retry only covers reconnect-after-connect), which previously `process.exit(1)`'d the service. The helper instead logs a boxed banner and retries `listen()` until the broker appears (dev), while keeping fail-fast `exit(1)` for `tcp` and `NODE_ENV=production`.
  - **Reconnect after drop:** the redis transport now sets `retryAttempts`/`retryDelay` and nats sets `reconnect`/`maxReconnectAttempts: -1`, so a broker that drops mid-run is re-attached instead of giving up.

## 0.5.0

### Minor Changes

- b7a156c: feat+fix: runtime DX overhaul and AI-ready scaffold

  **Runtime fixes**
  - _Circular DI import_: all `*-client` libs move their injection token to a
    dedicated `*.tokens.ts` leaf file — webpack bundling no longer causes
    `UndefinedDependencyException` at gateway startup.
  - _Env banner_: MS factories collect **all** missing provider vars and print a
    boxed banner (`formatEnvBanner` + `missingEnv` in `@icore/shared`). Dev →
    warn + fake strategy; prod (`NODE_ENV=production`) → fail-fast.
  - _Invalid placeholder values_ (e.g. `https://<your-project-ref>.supabase.co`)
    are caught by a try/catch around the SDK constructor and shown in the same
    banner with the SDK error as the reason.
  - _Gateway startup banner_: `formatGatewayBanner` prints a boxed table of MS
    transport targets on boot.
  - _Transport env banner_: `buildTransport` validates all required vars for the
    chosen transport kind and throws a readable banner instead of a cryptic error.
  - _Dev API proxy_: all 3 client templates proxy `/api → http://localhost:3001`
    via `commonServer(port)` so the default `VITE_API_URL=/api` works in dev.
  - _Client env_: `.env.example` added to all 3 templates; `writeClientEnv`
    copies it on scaffold.
  - _`@icore/vite-plugins` additions_: `commonServer`, `apiInfoPlugin`,
    `commonManualChunks`, `commonTestConfig` — shared utilities reduce duplication
    across templates.
  - _Payment MS_ env banner added (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).
  - _Unique debug ports_: each MS serve target gets its own inspect port
    (9229–9234) to avoid address-in-use warnings.
  - _`apps/api/.env` loaded_: `ConfigModule.forRoot` in the gateway now sets
    `envFilePath` so transport vars are actually read.

  **AI-ready scaffold**

  Every generated project now includes:
  - `CLAUDE.md` → `@AGENTS.md` (Claude Code entry point)
  - `AGENTS.md` — generated with stack snapshot, mandatory workflow rules, architecture, key patterns, commands, `.env` map — all interpolated from the chosen providers and package manager
  - `.claude/settings.json` — `@nx/mcp` always; `@supabase/mcp` / firebase MCP when the matching provider is chosen; permissions for nx, dev, prettier, git
  - `README.md` — stack table, quick-start, reference to iCore

## 0.4.1

### Patch Changes

- 65cdc16: fix: corepack PnP crash on yarn create + upgrade pinned yarn to 4.15.0

  `yarn create @idevconn/icore` ran the CLI inside a PnP dlx context where
  `spawnSync('yarn', ['install'])` triggered corepack, which could not resolve
  itself in the PnP virtual FS. Fix: `runInstall()` now reads `yarnPath` from
  the generated project's `.yarnrc.yml` and calls `node <path> install`
  directly, bypassing corepack entirely.

  Pinned yarn in generated projects upgraded from 4.5.0 to 4.15.0.

## 0.4.0

### Minor Changes

- 694c458: feat: @icore/vite-plugins, cross-boundary guards, no-crash on missing .env

  **@icore/vite-plugins** — new workspace lib shared by all client templates:
  `noServerModulesPlugin`, `injectAppVersionPlugin`, `commonDefines`,
  `commonManualChunks`, `commonTestConfig`. Replaces deprecated
  `TanStackRouterVite` with `tanstackRouter`.

  **No crash on missing .env** — MS factories wrap provider creation in
  try/catch; `new Logger().warn()` + `Fake*Strategy` returned so all ports
  bind without credentials. `writeNotesEnv` added to scaffold so the notes MS
  `.env` is written at generate time (fixes `NOTES_HOST` crash on first `yarn dev`).

  **Cross-boundary dependency guards** — Vitest static test catches `@nestjs/*`
  in client-side source and `react/*` in server-side source. Vite
  `no-server-modules` plugin in all 3 client templates fails the build if a
  server-only module is accidentally imported in client code.

  **`@icore/shared/client` sub-path** — browser-safe entry (abilities + types
  only) so `@nestjs/microservices` never reaches the Vite bundle.
  `ability-provider.tsx` updated to import from the sub-path.

## 0.3.1

### Patch Changes

- c127a23: fix: three runtime bugs in generated projects
  1. node:crypto in browser — FakeAuthStrategy/FakeStorageStrategy now use
     globalThis.crypto.randomUUID() which works in both Node 20+ and browsers
  2. Cryptic crash on empty env vars — MS factories now call requireEnv() which
     throws a human-readable error naming the .env file to fix
  3. Unused strategy builds — scaffold now removes non-selected auth/storage/db
     strategy libs and strips their imports from MS modules (e.g. --auth=supabase
     removes libs/auth-strategies/firebase and firebase-admin import from auth MS)

## 0.3.0

### Minor Changes

- 4d37ae4: feat: --example=notes|none flag and yarn remove-notes post-generate script

  Pass `--example=none` at generate time to skip the notes CRUD sample entirely.
  For existing projects, run `yarn remove-notes` to strip the notes MS, gateway
  module, client routes/queries/components, nav item, and i18n keys in one pass.
  The post-generate script uses `nx g @nx/workspace:remove` for Nx project
  removal (handles tsconfig paths) and custom logic for the remaining UI files.

## 0.2.3

### Patch Changes

- b117fd5: fix: ship complete templates — yarn releases, notes/payment/jobs MSes, Dockerfiles, .gitignore

  `prepublishOnly` previously ran only `tsup`, skipping `snapshot-templates`. Published 0.2.x packages
  were missing `templates/.yarn/releases/yarn-4.5.0.cjs` (causing ENOENT on `yarn install` in the
  generated project), the notes/payment/jobs microservices, Dockerfiles, docker-compose.yml, and
  `.gitignore`. Snapshot now runs as the first step in `prepublishOnly` and is converted to plain
  `.mjs` so it needs no TypeScript tooling to execute.

- 5089b72: Scaffolded projects are now runnable out of the box. v0.2.2 shipped the source tree but the scaffolded `package.json` was empty + the client template kept `../../../`-anchored paths that pointed one level above the project root.

  Fixes:
  - `_template-shell/package.json` now ships the full devDeps (`nx`, plugins, eslint, prettier, vitest, etc.) + runtime deps consumers need. `yarn install` actually installs nx so `yarn nx build api` works.
  - Scaffolder writes an empty `yarn.lock` at the project root. Anchors yarn 4 to the new directory so it stops walking up into the user's `$HOME` (where a stray `package.json`/`yarn.lock` would otherwise confuse the workspace boundary).
  - After copying the chosen client template to `apps/client`, the scaffolder rewrites the four files that hard-coded the old depth: `vite.config.mts`, `tsconfig*.json`, `project.json`, `eslint.config.mjs`. `../../../` → `../../`, `client-shadcn|antd|mui` → `client`.
  - `removePaymentStack` / `removeJobsStack` / `removeUploadStack` now also strip their deps from `apps/api/package.json` so yarn doesn't try to resolve `@icore/jobs-client`, `@idevconn/payment`, `@icore/upload-client`, `@bull-board/*`, `@types/multer` after opting out.
  - CLI prints its own version in the intro banner and warns when a newer version is on npm: `Re-run with @latest to refresh`.

## 0.2.2

### Patch Changes

- 057cf59: Disable npm provenance attestation in release workflow. Provenance triggers npm's quarantine flag on the `latest` tag, which yarn 4 strictly enforces — making `yarn create @idevconn/icore` fail for 30-60 min after every publish until npm's transparency log replicates. Without provenance there is no quarantine, so all package managers (npm / yarn / pnpm / bunx) work immediately after release. Re-enable when npm + yarn align on quarantine UX.

## 0.2.1

### Patch Changes

- 78007e7: Ship yarn 4.5.0 runtime + new Dockerfiles + payment/notes/jobs microservices in the CLI template snapshot. v0.2.0 missed:
  - `.yarn/releases/yarn-4.5.0.cjs` → scaffolded projects failed `yarn install` with `ENOENT: .yarn/releases/yarn-4.5.0.cjs`.
  - `apps/microservices/{payment,notes,jobs}` directories.
  - `Dockerfile.{gateway,ms-auth,ms-upload,ms-jobs}`, `docker-compose.yml`, `.env.docker.example`, `.dockerignore`.

  README now lists yarn / pnpm / bunx invocations alongside the npm one.

## 0.2.0

### Minor Changes

- 79dd249: Add the Ant Design 6 client template. `--ui=antd` no longer falls back to shadcn; it scaffolds a real antd SPA with the same route tree (`/`, `/login`, `/_dashboard/dashboard`, `/_dashboard/profile`), `setNotifier` host wired to antd's `notification`, and the `PageLayout` / `AccessDeniedPage` / `MainLayout` shape mirroring `ui-main/apps/client/src/layouts/`. MUI still falls back to shadcn until Plan 6.2 lands.
- 251819f: `DBStrategy` lib promotes the `--db` flag from cosmetic record to a real runtime dimension. Two concrete implementations ship: `@icore/db-supabase` (Postgres-table-backed JSONB documents) and `@icore/db-firestore` (firebase-admin Firestore). The CLI now writes `DB_PROVIDER` to the generated workspace root `.env`, so consumers can wire their own data microservices over the chosen backend independently of `AUTH_PROVIDER`. Mix-and-match combos like `--auth=firebase --db=supabase` are now first-class.
- c4fb0c3: `docker compose up` local dev stack. Three new Dockerfiles (`Dockerfile.gateway`, `Dockerfile.ms-auth`, `Dockerfile.ms-upload`) using Node 24 alpine multi-stage builds with corepack + yarn 4 immutable installs. `docker-compose.yml` orchestrates the three services + a Redis broker (transport=redis); gateway publishes `3001:3001`, MSes stay internal. `.env.docker.example` documents the credentials block; `docs/runbooks/local-docker.md` walks through the boot sequence. CI gains a `docker-build` matrix job that builds all three Dockerfiles on every push via buildx with GitHub Actions cache.
- 36181ef: Optional BullMQ-based jobs subsystem. CLI gains `--jobs=bullmq|none` (default `none`). When enabled, the scaffold ships `apps/microservices/jobs` (3 worker stubs: email / image-process / cleanup), `libs/jobs-client` (`@icore/jobs-client`) with typed `enqueue<K extends keyof JobsMap>(name, data)`, and a bull-board admin dashboard mounted at `/api/admin/queues`. New `JOBS_REDIS_URL` env, `Dockerfile.ms-jobs`, docker-compose `jobs` service, and CI matrix build entry. Hard-couples to Redis when enabled. **Caveat:** bull-board sits behind raw Express middleware, not Nest's AuthGuard — consumers must front it with reverse-proxy auth before exposing publicly.
- 7397e05: Passwordless email sign-in (magic link) across all auth providers + UI templates.
  - `AuthStrategy` gains `sendMagicLink({ email, callbackUrl })` and `verifyMagicLink(token)`.
  - Supabase implements via `signInWithOtp` + `verifyOtp({ type: 'magiclink' })`.
  - Firebase implements via Identity Toolkit `sendOobCode` + `signInWithEmailLink`, with the strategy serialising the email + `oobCode` as a single opaque token (`base64(email):oobCode`) so the contract stays single-string.
  - Auth MS handles `auth.magicLink.send` + `auth.magicLink.verify` patterns; the verify path reuses the existing `ADMINS_LIST` role hook so magic-link signups land in the same role assignment flow as password signups.
  - Gateway exposes `POST /api/auth/magic-link` + `POST /api/auth/magic-link/verify`, both `@Public()` and rate-limited by the existing `auth-burst` throttle (`CLIENT_ORIGIN` env drives the callback URL).
  - Every client template ships a Password / Magic-link mode switch on `/login` + a new `/auth/callback` route that exchanges the link's token for a session.
  - Each template's `vite.config.mts` now splits `node_modules` into library-specific vendor chunks (`vendor-react`, `vendor-tanstack`, `vendor-mui`/`vendor-antd`/`vendor-ui`, etc.) for cacheability and faster repeat loads.

- 0d82550: Add the MUI 6 client template. `--ui=mui` no longer falls back to shadcn; it scaffolds a real MUI SPA with the same route tree (`/`, `/login`, `/_dashboard/dashboard`, `/_dashboard/profile`), `setNotifier` wired to a custom MUI Snackbar host (Zustand-backed queue + stacked Alert toasts), and the `PageLayout` / `AccessDeniedPage` / `MainLayout` shape mirroring the shadcn and antd templates. All three UI dimensions of the CLI are now first-class — no UI choice falls back any more.
- 2124e6c: Notes sample feature demonstrating the full icore stack end-to-end: a notes microservice (single `DBStrategy`-backed collection), gateway CRUD with CASL ownership rules, and a `/_dashboard/notes` route in all three client templates with TanStack Query mutations + per-template UI (shadcn: custom Table/Dialog; antd: Table/Modal/Popconfirm; MUI: Table/Dialog/TablePagination). New `Note` type + ownership-scoped CASL rules in `@icore/shared`. Consumers boot the scaffold and immediately have a working CRUD demo to verify their auth/db wiring.
- 7b6bcd4: Server-mediated OAuth sign-in (Google + GitHub) across all auth providers + templates. `AuthStrategy` gains `startOAuth(provider, callbackUrl)` + `completeOAuth(provider, code, state)`. Supabase routes through `signInWithOAuth` + `exchangeCodeForSession`; Firebase builds the provider authorize URL itself and exchanges the code via Identity Toolkit `signInWithIdp` (new `HttpOAuthTokenClient` handles the provider's `/token` endpoint). Gateway exposes `GET /api/auth/oauth/:provider` (302 → provider, sets `HttpOnly` state cookie) and `GET /api/auth/oauth/:provider/callback` (verifies CSRF state cookie, then redirects to `${CLIENT_ORIGIN}/auth/oauth/callback#…tokens…`). Every client template ships "Continue with Google/GitHub" buttons on `/login` + an `/auth/oauth/callback` route that pulls the session from the URL fragment.
- 7820ccf: Optional payment microservice wrapping `@idevconn/payment`'s strategy registry. CLI gains `--payment=paypal|none` (defaults to `none`). When enabled, the scaffold ships `apps/microservices/payment` (PaypalStrategy by default, sandbox env), `libs/payment-client` (`@icore/payment-client`), and gateway routes `POST /api/payment/orders`, `POST /api/payment/orders/:id/capture`, `GET /api/payment/providers`. The gateway forwards an HTTP `Idempotency-Key` header as `RequestOptions.idempotencyKey`. Webhook + `getOrder` are deferred until `@idevconn/payment` exposes them.
- b6dbb78: Unified light/dark theme switching across all three UI templates (shadcn, antd, mui). A single Zustand store in `@icore/template-shared` (`useTheme()` / `useThemeStore`) drives each template's library-specific theming primitives — Tailwind `html.dark` class for shadcn, `ConfigProvider.theme.algorithm` for antd, `createTheme({ palette: { mode } })` for MUI. First load detects `prefers-color-scheme: dark`; subsequent loads restore from localStorage (`icore-theme`). Every template's LayoutHeader ships a `<ThemeToggle />` button.

### Patch Changes

- 09ee502: Re-enable sigstore provenance attestation on the npm publish workflow now that the GitHub repo is public. Published versions from this changeset onward carry a verifiable provenance bundle linked to the GitHub Actions run that produced them.
- e7947ad: Stabilise the npm publish flow:
  - `bin` is back to the explicit object form `{ create-icore: ./dist/cli.js }` so npm doesn't auto-rename it to a scoped key and then reject the path.
  - `release.yml` passes `--access public` to `npx changeset publish` and turns off provenance attestation for now (the GitHub repo is private; npm requires a public source repo for sigstore provenance verification and returns E422 otherwise). Flip `NPM_CONFIG_PROVENANCE` back to `'true'` once the repo is public.

## 0.1.1

### Patch Changes

- d01ae72: Fix the `bin` field shape and the build output so the published tarball actually has a working CLI:
  - `bin` is now an explicit object `{ "create-icore": "./dist/cli.js" }`. The old singleton-string form let npm rewrite the key into the scoped package name and then reject the path as an invalid script, breaking the publish.
  - Build emits both ESM (`dist/*.js`) and CJS (`dist/*.cjs`) via `tsup --format esm,cjs`, exposed through a proper `exports` map mirroring `@idevconn/use-draft`.
  - `package.json` picks up `keywords`, `bugs`, `homepage`, and a `prepublishOnly` guard (`typecheck && test && build`).

## 0.2.0

### Minor Changes

- fe00191: Initial release: bootstrap CLI that scaffolds an icore monorepo with the chosen auth provider (Supabase / Firebase), db provider (mirrors auth in v0.1.0), upload provider (Supabase / Firebase / Cloudinary / none), microservice transport (TCP / Redis / NATS), and UI library (shadcn for v0.1.0; antd + MUI fall back to shadcn until 6.1 / 6.2 ship).
