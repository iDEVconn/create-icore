# iCore — Agent Instructions

iCore is a bootstrap scaffold for Nx + NestJS + React projects. It ships infrastructure only — auth (password + magic-link + OAuth Google/GitHub), storage, authorization, optional payment (PayPal via `@idevconn/payment`), optional jobs (BullMQ + bull-board), all wired through strategy interfaces so the underlying provider is swappable via env. Includes a notes sample feature to verify the wiring end-to-end. No business domain beyond the demo.

## 🚀 Workflow & Verification

- **MANDATORY — CHECK PR STATUS BEFORE ANY ACTION:** Before pushing to a branch, updating a PR, or creating a new PR, ALWAYS run `gh pr list --state all --limit 10` to see the current state. A PR may already be MERGED or CLOSED. Pushing to a merged branch orphans commits (they don't reach the target). Creating a duplicate PR wastes cycles and confuses history. **No exceptions — check first, act second.**
- **MANDATORY — NEVER MERGE A PR AUTONOMOUSLY:** Do NOT run `gh pr merge` (or merge via the UI) on your own — not into `dev`, not anywhere. Your job ends at: push the branch, open the PR, and **wait for CI to go green**. The human reviews the green PR and performs every merge by hand. Merging before the user has looked robs them of review and has burned us before. Open the PR, report the CI result + the PR link, and stop. No exceptions — even when the change is "obviously correct" and CI is green.
- **MANDATORY — BRANCH STRATEGY:** Default working branch is `dev`, never `main`. `main` is the deploy target — pushing to it triggers a production rollout, so it stays untouched while a feature is in flight. Every new feature lives on its own `feature/<name>` branch cut from `dev`; every bug fix on `bug/<name>` cut from `dev`. PRs only target `dev`; the merge from `dev → main` is performed manually by the user when a batch of work is ready to ship. Hotfixes still follow the same path (`bug/<name>` → PR → `dev` → manual promote). Never open a PR against `main`. Never push commits directly to `main` (the merge happens by hand). After landing on `dev`, the same CI checks run but the deploy job is gated on `github.ref == 'refs/heads/main'` and stays idle.
- **MANDATORY — PR BASE IS ALWAYS DEV:** Every `gh pr create` call MUST include `--base dev`. No exceptions. Omitting `--base` defaults to the repo's default branch (`main`), which triggers a production deploy on merge. Burned before: PR accidentally targeted main. Always: `gh pr create --base dev --title "..." --body "..."`.
- **MANDATORY — NO CODE CHANGES WITHOUT APPROVAL:** Never edit, create, or delete source code files without the user's explicit approval. Always propose the change first, explain what will be modified, and wait for a go-ahead before writing any code.
- **MANDATORY — SKILLS FIRST:** At session start, invoke `superpowers:using-superpowers` (or the platform's discovery equivalent). For ANY UI/UX decision — component design, color, typography, layout, chart type, etc. — invoke the `ui-ux-pro-max` skill **before** writing code. If the skill isn't installed in the current environment, surface a one-line install hint to the user and proceed with sensible defaults — never silently skip this gate.
- **MANDATORY — USE NX GENERATORS, NOT HAND-CRAFTED PROJECT FILES:** Never hand-write `project.json` / tsconfig stacks for a new app or lib. Always create projects via `yarn nx g @nx/<plugin>:<schematic>` (`@nx/js:lib`, `@nx/nest:app`, `@nx/react:app`, etc.). Hand-rolled targets bypass plugin inference, break `nx graph`, weaken cache I/O metadata, and block `nx migrate`. If the generator's defaults don't match what you need, tweak post-generation — do not skip the generator.
- **MANDATORY — CI PIPELINES COME IN PAIRS:** When adding or renaming a frontend env var that the prod bundle needs (`VITE_*`), update **both** `.github/workflows/pipeline.yml` (the auto release-on-push pipeline) **and** `.github/workflows/manual-deploy.yml` (the hotfix / on-demand rebuild). Each workflow has its own `build-frontend-secrets` job — the manual one runs in isolation, so a missing var there silently ships a bundle without the flag/key until the next push to `main`. Same applies to API env vars: the VPS `.env` block lives in both workflows' deploy step. If you touched one, grep the other for the same var name before pushing.
- **MANDATORY — GITHUB ACTIONS ON NODE 24:** Every `uses:` entry in `.github/workflows/*.yml` and `.github/actions/**/action.yml` must pin a version that runs on Node.js 24. GitHub deprecated Node 20 runners (forced Node 24 from 2026-06-02, removed 2026-09-16). Current safe pins: `actions/checkout@v5`, `actions/setup-node@v5`, `actions/cache@v5`, `actions/upload-artifact@v5`, `nrwl/nx-set-shas@v5`, `docker/setup-buildx-action@v4`, `docker/build-push-action@v7`, `changesets/action@v1`. When adding a new action, check its latest release supports Node 24 (`curl -s https://api.github.com/repos/<owner>/<repo>/releases/latest | grep tag_name`) and pin that major. Never accept a Node-20 deprecation warning in CI — bump the action the same commit.
- **MANDATORY — REACT 19 EVENT TYPES:** Never use `FormEvent` or `FormEventHandler` from React — both are deprecated in React 19 ("FormEvent doesn't actually exist"). Use `SyntheticEvent<HTMLFormElement>` for form submit handlers: `import { SyntheticEvent } from 'react'` and type as `(e: SyntheticEvent<HTMLFormElement>)`. For `onChange` input handlers, let TypeScript infer the type from JSX context (no annotation needed) or use `ChangeEvent<HTMLInputElement>` (not deprecated). This applies to every React component in `apps/client/` and `apps/templates/client-*/`.
- **MANDATORY — ONE COMPONENT PER FILE:** Each React component lives in its own `.tsx` file under `components/<area>/<name>.tsx`. **Do NOT stack helper components, subcomponents, modal bodies, stat cards, breakdown tables, etc. inside a single module — even small ones.** Route files (`routes/_dashboard/.../page.tsx`) MAY define a thin `Route = createFileRoute(...)` plus a tiny page wrapper that composes already-extracted children; everything else (forms, modals, tables, charts, stat cards, empty states, skeletons, range selectors, …) belongs in `components/`. Pure helper functions can co-locate with their single consumer or move to `lib/`. Tests sit in a sibling `__tests__/` folder next to the component. **If you find yourself adding a second `function FooSomething()` to an existing file, stop and extract first.**
- **MANDATORY — CHANGESET FOR EVERY PR:** Every PR that targets `dev` MUST include a `.changeset/<slug>.md` file. No exceptions — not for test-only changes, not for docs, not for "trivial" fixes. Without a changeset the Release workflow sees nothing to publish and skips the version bump silently. Burned before: changesets added as emergency follow-up PRs after the fact. Correct flow: create the changeset file on the feature branch before opening the PR. Use `patch` for fixes/tests/docs, `minor` for new features, `major` for breaking changes. File format: `.changeset/<kebab-slug>.md` with frontmatter `--- "@idevconn/create-icore": patch ---` followed by a one-line description.
- **MANDATORY — CHECK PR MERGED STATE BEFORE GIVING ADVICE:** Before telling the user "merge X before Y" or "do A then B", ALWAYS run `gh pr list --state all --limit 10` and verify the current merged/open state of every PR you reference. Giving sequencing advice about a PR that is already MERGED is useless and wastes cycles. Burned before: told user to merge #125 before #123 after #123 was already merged. Check first, advise second. No exceptions.
- **MANDATORY — PRETTIER BEFORE EVERY COMMIT:** Run `npx prettier --write <touched files>` on ALL modified files before staging them. No exceptions — not for "one-line fixes", not for test files, not for config files. CI runs `prettier --check` and will fail if you skip this. Burned before: CI red on every PR that skipped this step.
- **MANDATORY — POST-CODING ROUTINE:** After EVERY coding task, run these four steps in order before committing — `prettier + lint + build + update docs`:
  1. `npx prettier --write <touched files>` — **ALWAYS. No exceptions. Run this first.**
  2. `nx lint <project>` — 0 errors. Pre-existing warnings unrelated to the touched files are tolerable.
  3. `nx build <project>` — green.
  4. Update the relevant `.md` files in `docs/` (or `AGENTS.md`). Describe problem + solution + test plan. New runbooks go in `docs/runbooks/`, plans in `docs/superpowers/plans/`.
     No commit lands with a red lint, red build, or undocumented behavior change. The pre-commit hook backstops 1–3; step 4 is on you.
- **Clean Code:** Actively remove unused imports, duplicated code, and deprecated APIs.

## Architecture

Nx monorepo. Yarn 4 (node-modules linker — NOT PnP). Plugins active via `nx.json`: `@nx/js`, `@nx/vite/plugin`, `@nx/webpack/plugin`, `@nx/jest/plugin`, `@nx/eslint/plugin`, `@nx/vitest`. Generators always.

```
apps/
├── api/                  # NestJS gateway — all client traffic enters here
├── microservices/
│   ├── auth/             # AuthStrategy consumer
│   └── upload/           # StorageStrategy consumer
└── client/               # Vite + React 19 + shadcn + Tailwind
libs/
├── shared/               # types, CASL defineAbilitiesFor, strategy contracts, transport helper
├── auth-strategies/
│   ├── supabase/
│   ├── firebase/
│   └── mongodb/
├── storage-strategies/
│   ├── supabase/
│   ├── firebase/
│   ├── cloudinary/
│   └── mongodb/
├── db-strategies/
│   ├── supabase/
│   ├── firebase/
│   └── mongodb/
├── auth-client/          # gateway → auth MS client (NestJS module)
└── upload-client/        # gateway → upload MS client (NestJS module)
tools/
└── create-icore/         # npx CLI source
```

Frontend never imports a provider SDK directly. All auth + storage traffic goes through `apps/api` → microservice → strategy.

## Key Patterns

- **Strategy-pattern auth + storage:** `libs/shared/src/strategies/{auth,storage,db}.ts` defines the `AuthStrategy`, `StorageStrategy`, and `DBStrategy` interfaces. Each MS module wires a factory provider that reads `AUTH_PROVIDER` / `STORAGE_PROVIDER` / `DB_PROVIDER` env and returns the concrete implementation. The contract test suite `runAuthContract(name, factory)` / `runStorageContract(name, factory)` runs against every concrete strategy and the in-memory `FakeAuthStrategy` / `FakeStorageStrategy`.
- **Env layering (3 layers):**
  - **Transport wiring** (gateway ↔ MS): `${PREFIX}_TRANSPORT` (`tcp` default | `redis` | `nats` | `mqtt` | `rmq` | `kafka`) + the matching host/port/url vars; read by `buildTransport(prefix)` in `libs/shared/src/transport.ts`. All six are message-pattern transports (work with `@MessagePattern` + `ClientProxy.send/emit`). gRPC is intentionally NOT offered — it needs `.proto` contracts + `@GrpcMethod` controllers + `ClientGrpc`, incompatible with the message-based gateway↔MS layer. Each broker transport's driver (`nats`, `mqtt`, `amqplib`+`amqp-connection-manager`, `kafkajs`) is an optional peer dep of `@nestjs/microservices`; `rewriteRootPackageJson` adds it to the generated `package.json` for the chosen transport.
  - **Provider selection** (per MS): `AUTH_PROVIDER`, `STORAGE_PROVIDER`; read by the MS `useFactory`.
  - **Provider credentials** (per concrete strategy): `SUPABASE_*`, `FB_ADMIN_*`, `CLOUDINARY_*`; injected via `ConfigService`.

  Each MS loads its own `.env` from `apps/microservices/<name>/.env` via `ConfigModule.forRoot({envFilePath: ...})`. `libs/shared` is env-free.

- **Auth flow:** Client sends credentials to `POST /api/auth/{login,register,refresh}` on the gateway. Gateway calls the auth MS over the chosen transport. Auth MS delegates to the configured `AuthStrategy`. Subsequent requests carry `Authorization: Bearer <token>`. Global `AuthGuard` on the gateway extracts and verifies the token by round-tripping to the auth MS (`auth.verify`). `@Public()` decorator exempts routes from the guard.
- **Data fetching:** React Query hooks in `apps/client/src/queries/`. API client `apps/client/src/api/client.ts` wires the external `@idevconn/api-client` pkg — auto token refresh, typed `ApiError(status, body)`, and an `onError` hook for centralized error reporting.
- **Global state:** Zustand store `apps/client/src/stores/auth.ts` (persist middleware). Draft/dirty-form tracking lives in `@idevconn/use-draft`.
- **Routing:** TanStack Router file-based routes. `_dashboard.tsx` is the protected layout with `beforeLoad` auth check.
- **i18n:** `i18next` + `react-i18next`. 3 languages: English, Russian, Hebrew (RTL). Translations in `apps/client/src/i18n/locales/{en,ru,he}.json`. Language saved in localStorage (`icore-lang`).
- **Styling:** Tailwind CSS 4 with `@tailwindcss/vite` plugin. Dark mode by default. shadcn/ui components.
- **CASL Authorization:** `libs/shared/src/abilities/defineAbilitiesFor(user)` is the single source of truth for ability rules. Backend: `AbilityFactory.forUser` + `AbilityGuard` + `@CheckAbility(action, subject)` on admin endpoints. Frontend: `<AbilityProvider>` in `main.tsx` + declarative `<Can I="action" a="Subject">` gates. Never use `if (!ability.can(...)) return <denied>` in components.
- **Shared Logic:** Common types and CASL rules live in `libs/shared`, exported via the `@icore/shared` alias.
- **Storage refs:** `StorageStrategy.upload()` returns `{ bucket, path }`. Frontend resolves these via `GET /api/storage/signed-url?bucket=...&path=...`. Signed URL TTL defaults to 15 min. `assertOwnership(ref, userId)` parses the path's leading segment and throws `Forbidden` when it does not match `req.user.id`.

## Provider-specific Setup

The strategy pattern abstracts the provider at runtime, but each concrete strategy has its own setup quirks. Document each provider you ship.

### Supabase (auth + storage)

**Env vars (per MS that uses it):**

```
AUTH_PROVIDER=supabase               # or STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...     # admin client; bypasses RLS — keep secret
SUPABASE_STORAGE_BUCKET=uploads      # storage MS only
```

**Setup:**

1. Create a project at https://app.supabase.com.
2. Copy URL + anon key + service role key into the MS `.env`.
3. For storage: create the bucket in the Supabase dashboard. Set it private (`public: false`). MIME allowlist and ownership prefix are enforced by the `SupabaseStorageStrategy`, not by Supabase RLS — the strategy uses the service-role client to bypass RLS and applies ownership in code.

**Migrations (Supabase Postgres):**

- All schema lives in `supabase/migrations/<TIMESTAMP>_<name>.sql`, checked in.
- CI runs `supabase db push` to apply pending migrations on deploy.

**Supabase MCP migration gotcha:** NEVER use `mcp__plugin_supabase_supabase__apply_migration` for changes that have a local file in `supabase/migrations/`. The MCP tool inserts a row into `supabase_migrations.schema_migrations` with its own auto-generated timestamp, which won't match your local file's timestamp — the next `supabase db push` in CI fails with "Remote migration versions not found in local migrations directory". Correct workflow:

1. Write the migration file under `supabase/migrations/<TIMESTAMP>_<name>.sql`.
2. Apply the DDL via `mcp__plugin_supabase_supabase__execute_sql` (NOT `apply_migration`).
3. **Immediately** insert the matching registry row so CI's `supabase db push` skips the file:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('<TIMESTAMP>', '<name_without_prefix>');
   ```
4. Commit the local file.

Recovery if you forgot step 3 and CI failed: run the INSERT above via `execute_sql`, re-run the failed CI job.

### Firebase (auth + storage)

**Env vars (per MS that uses it):**

```
AUTH_PROVIDER=firebase               # or STORAGE_PROVIDER=firebase
FB_ADMIN_TYPE=service_account
FB_ADMIN_PROJECT_ID=<your-project-id>
FB_ADMIN_PRIVATE_KEY_ID=<id>
FB_ADMIN_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
FB_ADMIN_CLIENT_EMAIL=firebase-adminsdk-<hash>@<project-id>.iam.gserviceaccount.com
FB_ADMIN_CLIENT_ID=<id>
FB_ADMIN_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FB_ADMIN_TOKEN_URI=https://oauth2.googleapis.com/token
FB_ADMIN_AUTH_PROVIDER_X509_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FB_ADMIN_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-<hash>%40<project-id>.iam.gserviceaccount.com
FB_ADMIN_UNIVERSE_DOMAIN=googleapis.com
FIREBASE_STORAGE_BUCKET=<project-id>.appspot.com  # storage MS only
```

**Setup:**

1. Create a Firebase project at https://console.firebase.google.com.
2. Project Settings → Service accounts → Generate new private key. Download the JSON.
3. Copy the JSON fields into the MS `.env` as `FB_ADMIN_*` variables. The private key must keep its `\n` newline escapes — quote it with single quotes in the .env file.
4. For storage: enable Cloud Storage in the Firebase console. Note the default bucket name (`<project-id>.appspot.com`).
5. Auth: enable the Email/Password provider in Firebase Auth (or other providers via `AuthStrategy.signIn` extensions).

**`firebase-admin` initialization gotcha:** The Firebase Admin SDK is initialized in the strategy constructor using `admin.initializeApp({ credential: admin.credential.cert({...}) })`. Re-initialization in the same process throws "default app already exists" — guard with `admin.apps.length` or use a named app instance for tests.

**Firestore rules / Storage rules deploy:** If the project uses Firestore for any data, the rules live in `firestore.rules` / `storage.rules` at the repo root. Deploy via `firebase deploy --only firestore:rules,storage:rules`. The Firebase CLI must be authenticated with an account that has Editor role on the project. CI deploys rules via the same command using a service-account token stored as `FIREBASE_TOKEN` secret.

**Firestore MCP equivalent of the Supabase migration gotcha:** Firestore is schemaless, so there are no migration files. Schema changes are application code. The closest parallel is rules drift — if you edit rules in the console without committing the file change, the next `firebase deploy --only firestore:rules` will silently overwrite the console-edited rules. Always edit rules in `firestore.rules` and deploy via CLI, never directly in the console.

### MongoDB (auth + storage + db)

**Env vars:**

```
AUTH_PROVIDER=mongodb
STORAGE_PROVIDER=mongodb
DB_PROVIDER=mongodb
MONGODB_URI=mongodb://localhost:27017/icore
JWT_SECRET=your-secret
```

**Setup:**

1. Install MongoDB or use a managed service (e.g., MongoDB Atlas).
2. Set `MONGODB_URI` in your `.env`.
3. Storage uses GridFS. No additional setup required beyond the connection string.
4. Auth is a custom implementation storing users and sessions in MongoDB collections.

### PostgreSQL (db only)

**Env vars:**

```
DB_PROVIDER=postgres
POSTGRES_URL=postgresql://user:pass@host:5432/dbname
```

**Setup:**

1. Any PostgreSQL >= 14 instance works: Docker, Neon, Railway, AWS RDS, self-hosted.
2. No schema setup required — tables auto-created on first write per collection.
3. GIN index on `data` JSONB column created automatically per collection.

**Schema:** Each collection maps to one table: `id TEXT PRIMARY KEY, data JSONB NOT NULL`.

**Note:** `POSTGRES_URL` must include credentials. For SSL, append `?sslmode=require` to the URL.

### Cloudinary (storage only)

**Env vars:**

```
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
```

**Setup:**

1. Create an account at https://cloudinary.com.
2. Copy cloud name + API key + API secret from the dashboard.
3. The `CloudinaryStorageStrategy` calls `cloudinary.config({...})` on first upload; no global init is required.

**Signed URLs:** Cloudinary signed delivery URLs are generated via `cloudinary.utils.private_download_url()`. The TTL is encoded in the URL itself; do not cache the URL longer than the chosen TTL.

## Commands

- `yarn install` — install all dependencies (root + workspaces)
- `yarn nx run-many -t serve` — start all servable projects
- `yarn nx build <project>` — build a single project
- `yarn nx test <project>` — run unit tests for a project
- `yarn nx run-many -t lint test build` — full pre-merge check across affected projects
- `yarn nx graph` — open the dependency graph in the browser

## Testing

- **Philosophy:** Test behavior, not implementation.
- **Unit Tests:** Vitest. Files named `*.unit.test.ts(x)` co-located in `__tests__/` next to the source.
- **Strategy contract tests:** Every concrete strategy (Supabase, Firebase, Cloudinary) runs `runAuthContract(name, factory)` / `runStorageContract(name, factory)` from `@icore/shared`. A passing contract is the gate for "this strategy is interchangeable with the others".
- **E2E Tests:** Playwright in `apps/client/e2e/`. Files named `*.spec.ts`. The smoke suite spawns the gateway + both microservices with `FakeAuthStrategy` + `FakeStorageStrategy` (no real provider calls in CI).
- **Run:** `yarn nx test <project>` or `yarn nx run-many -t test` for all.

## NestJS tsconfig

API + microservice tsconfigs override `module: CommonJS` and `moduleResolution: node16` (required for NestJS decorators and `node:crypto` style imports). `tsconfig.base.json` does NOT set `module` or `moduleResolution` — each project tsconfig picks what it needs (Vite client uses `bundler`, NestJS uses `node16`). The `@icore/shared` path alias resolves from `tsconfig.base.json` `paths`.

## Important

- `@Public()` decorator exempts routes from `AuthGuard` (login, register, refresh, webhooks).
- `@CheckAbility(action, subject)` enforces CASL rules on admin endpoints — server is the source of truth, the client `<Can>` is UX only.
- Build artifacts (`dist/`, `.vite/`, `.nx/`) are gitignored — do not commit them.
- `.env` files are gitignored. Each MS ships a `.env.example` committed alongside its `.env`.
- The `.husky/pre-commit` hook runs lint-staged + `nx affected -t lint test` on every commit. Never bypass with `--no-verify` — fix the underlying issue.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
