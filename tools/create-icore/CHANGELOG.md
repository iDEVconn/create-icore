# @idevconn/create-icore

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
