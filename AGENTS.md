# Warranty Dashboard — Agent Instructions

## 🚀 Workflow & Verification

- **MANDATORY — BRANCH STRATEGY:** Default working branch is `dev`, never `main`. `main` is the deploy target — pushing to it triggers a production rollout, so it stays untouched while a feature is in flight. Every new feature lives on its own `feature/<name>` branch cut from `dev`; every bug fix on `bug/<name>` cut from `dev`. PRs only target `dev`; the merge from `dev → main` is performed manually by the user when a batch of work is ready to ship. Hotfixes still follow the same path (`bug/<name>` → PR → `dev` → manual promote). Never open a PR against `main`. Never push commits directly to `main` (the merge happens by hand). After landing on `dev`, the same CI checks run but the deploy job is gated on `github.ref == 'refs/heads/main'` and stays idle.
- **MANDATORY — NO CODE CHANGES WITHOUT APPROVAL:** Never edit, create, or delete source code files without the user's explicit approval. Always propose the change first, explain what will be modified, and wait for a go-ahead before writing any code.
- **MANDATORY — READ API RULES:** Before modifying any backend endpoints, you must review `rules/api-rules.md`.
- **MANDATORY — READ COPILOT RULES:** Before writing code, you must review `rules/github-copilot-rules.md` for past review lessons.
- **MANDATORY — READ ENV RULES:** Before writing code, you must review `rules/env-keys-rules.md` for past review lessons.
- **MANDATORY — SKILLS FIRST:** At session start, invoke `superpowers:using-superpowers` (or the platform's discovery equivalent). For ANY UI/UX decision — component design, color, typography, layout, chart type, etc. — invoke the `ui-ux-pro-max` skill **before** writing code. If the skill isn't installed in the current environment, surface a one-line install hint to the user and proceed with sensible defaults — never silently skip this gate.
- **MANDATORY — CI PIPELINES COME IN PAIRS:** When adding or renaming a frontend env var that the prod bundle needs (`VITE_*`), update **both** `.github/workflows/pipeline.yml` (the auto release-on-push pipeline) **and** `.github/workflows/manual-deploy.yml` (the hotfix / on-demand rebuild). Each workflow has its own `build-frontend-secrets` job — the manual one runs in isolation, so a missing var there silently ships a bundle without the flag/key until the next push to `main`. Same applies to API env vars: the VPS `.env` block lives in both workflows' deploy step. If you touched one, grep the other for the same var name before pushing.
- **MANDATORY — PRIVACY POLICY HAS TWO COPIES:** Whenever you touch `PRIVACY_POLICY.md`, also update the in-app policy that users actually see. The web copy lives in `apps/client/src/i18n/locales/{en,ru,he}.json` under the `footer.privacy.*` keys, and is rendered by `apps/client/src/routes/privacy.tsx`. Mirror every new section / list item / lastUpdated date across all three locale files AND wire any new keys into the route, otherwise the deployed app will show a stale policy. The markdown file is for the repo + GitHub; the JSON keys are the production source of truth.
- **MANDATORY — ONE COMPONENT PER FILE:** Each React component lives in its own `.tsx` file under `components/<area>/<name>.tsx`. **Do NOT stack helper components, subcomponents, modal bodies, stat cards, breakdown tables, etc. inside a single module — even small ones.** Route files (`routes/_dashboard/.../page.tsx`) MAY define a thin `Route = createFileRoute(...)` plus a tiny page wrapper that composes already-extracted children; everything else (forms, modals, tables, charts, stat cards, empty states, skeletons, range selectors, …) belongs in `components/`. Pure helper functions (`formatTokens`, `compareUsers`, etc.) can co-locate with their single consumer or move to `lib/`. Tests sit in a sibling `__tests__/` folder next to the component. **If you find yourself adding a second `function FooSomething()` to an existing file, stop and extract first.**
- **MANDATORY — POST-CODING ROUTINE:** After EVERY coding task, run these four steps in order before committing — `prettier + lint + build + update docs`:
  1. `npx prettier --write <touched files>` (or rely on the pre-commit hook if it covers prettier).
  2. `nx lint <project>` — 0 errors. Pre-existing warnings unrelated to the touched files are tolerable.
  3. `nx build <project>` — green.
  4. Update the relevant `.md` files in `docs/` (or `AGENTS.md`). Describe problem + solution + test plan. New runbooks go in `docs/runbooks/`, plans in `docs/superpowers/plans/`.
     No commit lands with a red lint, red build, or undocumented behavior change. The pre-commit hook backstops 1–3; step 4 is on you.
- **Clean Code:** Actively remove unused imports, duplicated code, and deprecated APIs (e.g., use `title` instead of `message` in `notificationApi`).
- **Authorization:** Single CASL.js rule definition in `libs/shared/src/abilities/defineAbilitiesFor` powers both backend and client. Backend uses `AbilityGuard` (global APP_GUARD) + `@CheckAbility(action, subject)` on admin endpoints — server is the source of truth (returns 403 regardless of client state). Client wraps the React tree with `<AbilityProvider>` and gates UI with the `<Can>` component (declaratively — never `if (!ability.can(...)) return <denied>`). Both layers share the same `defineAbilitiesFor` so rules cannot drift. Subscription-tier gating remains in the `@idevconn/isubscribe-entitlements` package (separate layer for feature/quota concerns).
- **Release Fixes:** If encountering push rejections in CI, refer to `docs/release-fix.md` (perform `git pull --rebase` before pushing).

## Architecture

Nx monorepo with three packages:

- `apps/client` — Vite + React 19 + TanStack Router + React Query + Zustand
- `apps/api` — NestJS 11 (all Supabase interaction goes through here)
- `libs/shared` — shared types and utilities

Frontend does NOT know about Supabase. All data flows through NestJS API.

## Key Patterns

- **Auth**: Supabase Auth via NestJS. Client sends credentials to `/api/auth/login`, gets JWT. Every request includes `Authorization: Bearer <token>`. Global `AuthGuard` + `RolesGuard` on API.
- **Data fetching**: React Query hooks in `apps/client/src/queries/`. API client `apps/client/src/api/client.ts` is a thin wiring of the external `@idevconn/api-client` pkg — auto token refresh, typed `ApiError(status, body)`, and an `onError` hook that forwards every non-OK response to Bugfender via `reportError("api", …)`. Per-mutation error handling stays in React Query.
- **Global state**: Zustand store `apps/client/src/stores/auth.ts` (persist middleware). Draft/dirty-form tracking lives in the external `@idevconn/use-draft` npm package (re-export of `useDraftStore`).
- **Routing**: TanStack Router file-based routes. `_dashboard.tsx` is the protected layout with `beforeLoad` auth check. Product detail uses folder-based routing (`$id/index.tsx` + `$id/edit.tsx`) with `$id.tsx` as Outlet layout. Products page accepts query params: `?q=`, `?warranty=active|expiring|expired`, `?month=YYYY-MM`.
- **i18n**: `i18next` + `react-i18next`. 3 languages: English, Russian, Hebrew (RTL). Translations in `src/i18n/locales/{en,ru,he}.json`. Language switcher in header with flags. `dir="rtl"` auto-set on html element. Use `useTranslation()` + `t("key")` in all components. Language saved in localStorage (`warranty-lang`).
- **Styling**: Tailwind CSS 4 with `@tailwindcss/vite` plugin. Dark mode by default. shadcn/ui components.
- **Unsaved changes**: `useDraft(isDirty)` hook from `@idevconn/use-draft` (external npm pkg, no longer local). Blocks TanStack Router navigation (modal dialog) and browser close (native dialog). Any form calls `useDraft(isDirty)` — pkg's internal Zustand store tracks all dirty forms globally. Read `useDraftStore((s) => s.isDirty)` from any component (also re-exported by the pkg). Uses TanStack Router's built-in `useBlocker` with resolver mode (`proceed`/`reset`).
- **File uploads**: Product photos max `VITE_MAX_PHOTO_SIZE_KB` (default 200 KB), invoices max `VITE_MAX_INVOICE_SIZE_KB` (default 2048 KB). API also validates via `MAX_INVOICE_SIZE_KB`. `useUploadFile()` automatically marks global draft store as dirty during upload — navigation is blocked while files are uploading regardless of which form triggers it. Orphan files (uploaded but not saved) are cleaned up on form unmount via `DELETE /api/storage/remove`.
- **NestJS**: Each domain has its own module (auth, products, notifications, invoices, storage, webhooks, admin, profile, subscriptions). `SupabaseModule` is global, provides admin + anon clients. `SchedulerModule` provides warranty expiry cron controlled by `NOTIFICATION_PROVIDER` env var.
- **Profile**: `GET /api/profile` returns `{ full_name, last_logged_in_at, hasGeminiKey, avatar_url }`. Avatar resolved from IDP `user_metadata.avatar_url`, falls back to Gravatar MD5. `touchLogin()` fire-and-forgets upsert of `last_logged_in_at` on every `getMe`. Profile page at `/profile`.
- **Subscriptions**: Plans managed externally by isubscribe.me (separate SaaS); fetched server-side via `ISubscribeService` (cached 1h) and re-resolved at every entitlements decision. The `@idevconn/isubscribe-entitlements` pkg owns authorization — `EntitlementsSupabaseModule.registerAsync` (from the `/nest/supabase` subpath) autowires the Supabase persistence adapter to `user_subscriptions` and bridges logging, using a `planResolver` that translates iSubscription DTOs into `PlanDefinition`s, a `fallbackPlan` set to Starter (covers the OAuth signup race and legacy users without a row), and a custom `contextResolver` class `SecureUserContextResolver` that reads only `req.user.id` from the existing `AuthGuard` (NEVER headers — audit `iDEVconn/isubscribe-entitlements#1`). The pkg's `APP_GUARD` auto-registration is disabled (`global: false`); `EntitlementsGuard` + `@RequireSubscription` are applied per-controller. PayPal flow: widget callback → `POST /api/subscriptions` (server re-fetches plan and uses `plan.effectivePrice`/`effectiveCurrency` — never the client DTO's price fields) → `@idevconn/payment` order → `approveUrl` redirect → `/subscriptions/success?token=<orderId>` → `POST /api/subscriptions/capture { orderId, planId }` (server verifies orderId matches stored `last_order_id` and re-resolves plan) → `entitlements.saveSubscription`. Daily cron `SubscriptionsRenewalService` creates a fresh PayPal order + in-app notification per due paid sub (no auto-debit); free subs renew in place. `EntitlementsExceptionFilter` strips `details.userId`/`details.tenantId` from 4xx bodies in production (audit L2). Feature gating lives in `libs/shared/src/features.ts` as `FEATURE_IDS` (Firestore UUIDs from iSubscription dashboard) → `FEATURE_VALUES` (semantic limits/booleans). Adding a new gate = decorate the route with `@RequireSubscription({feature: FEATURE_IDS.X})` + enforce in the service (decorator is defense-in-depth, NOT cap enforcement; cardinality caps like MAX_PRODUCTS must count manually in the service — pkg's `consume()` semantics are wrong for non-metered features).
- **CASL Authorization**: `libs/shared/src/abilities/defineAbilitiesFor(user)` is the single source of truth for ability rules. Backend: `AbilityFactory.forUser` + `AbilityGuard` + `@CheckAbility(action, subject)` on admin endpoints (replaces `@Roles('admin')`). Frontend: `<AbilityProvider>` in `main.tsx` + declarative `<Can I="action" a="Subject">` gates. Never use `if (!ability.can(...)) return <denied>` in components.
- **Shared Logic**: Common types, warranty calculations, and AI response parsing live in `libs/shared`. Shared utilities are exported via `@warranty/shared` alias.
- **Storage**: Private buckets (e.g., `invoices`) use `storage://{bucket}/{path}` URI scheme. Frontend resolves these via `GET /api/storage/signed-url?path=...`. Public files (e.g., product photos) use standard Supabase public URLs. Signed URL TTL = 15 min. Uploads enforce a MIME allowlist per bucket (`invoices`: pdf/jpeg/png; `product-images`: jpeg/png/webp). `assertOwnership()` parses both `storage://` URIs and legacy public URLs and throws `Forbidden` when the path's leading segment doesn't match `req.user.id`.
- **PII / external data flow**: Invoice files contain personal data (name, address, line items, prices). Files are sent to Google Gemini (`InvoicesService.parseInvoice`) for OCR/structured extraction — Google receives the raw file bytes. Bucket itself is private (`public: false`) with RLS, but service-role admin client is used everywhere on the API; protection relies on `StorageController` calling `assertOwnership` before issuing signed URLs or deletes. Future work: opt-in user consent for Gemini parsing and an audit log for invoice access.

## Commands

- `npm install` — install all dependencies (root, apps, libs)
- `npm run dev` — start both client and api in dev mode via Nx
- `npm run build` — build all packages
- `npm test` — run all unit tests across the monorepo

## Testing

- **Philosophy**: Test behavior, not implementation.
- **Unit Tests**: Vitest. Files named `*.unit.test.ts(x)`.
- **Co-location**: Tests live in `__tests__/` directories next to the source files they test.
- **E2E Tests**: Playwright in `apps/client/e2e/`. Files named `*.spec.ts`.
- **Run**: `nx test {project}` or `npm test` for all.

## NestJS tsconfig

The API tsconfig overrides `module: CommonJS` and `moduleResolution: node` (required for NestJS decorators). `baseUrl: ../../` resolves `@warranty/shared` path.

## Important

- **Supabase MCP migration gotcha**: NEVER use `mcp__plugin_supabase_supabase__apply_migration` for changes that have a local file in `supabase/migrations/`. The MCP tool inserts a row into `supabase_migrations.schema_migrations` with its own auto-generated timestamp, which won't match your local file's timestamp — the next `supabase db push` in CI fails with "Remote migration versions not found in local migrations directory". Correct workflow when applying a fresh migration:
  1. Write the migration file under `supabase/migrations/<TIMESTAMP>_<name>.sql`.
  2. Apply the DDL via `mcp__plugin_supabase_supabase__execute_sql` (NOT `apply_migration`).
  3. **Immediately** insert the matching registry row so CI's `supabase db push` skips the file:
     ```sql
     insert into supabase_migrations.schema_migrations (version, name)
     values ('<TIMESTAMP>', '<name_without_prefix>');
     ```
     Skipping this step makes CI re-apply the DDL on the next push to main → `ERROR: type "x" already exists` and a failed deploy.
  4. Commit the local file.

  Recovery if you forgot step 3 and CI failed: run the INSERT above via `execute_sql`, re-run the failed CI job. If you used `apply_migration` and got an MCP-timestamp drift: `update supabase_migrations.schema_migrations set version = '<local-ts>' where version = '<mcp-ts>'`.

- `@Public()` decorator exempts routes from AuthGuard (login, register, webhooks)
- `@Roles("admin")` restricts to admin users
- Service role client bypasses RLS for all DB operations
- Anon client used only for `signInWithPassword` and `refreshSession`
- Deleting a product also removes its image and invoice files from Supabase Storage
- Invoice parsing returns an array (multi-product invoices supported). LLM routing lives in the external `@idevconn/llm-router` pkg: `LlmRegistry<MlProviderName>` with `GeminiStrategy` / `ClaudeStrategy` / `GrokStrategy` adapters from the pkg's subpath exports. Active provider chosen by `ML_STRATEGY` env (`gemini` | `claude` | `grok`), model by `GEMINI_MODEL` / `CLAUDE_MODEL` / `GROK_MODEL`. Per-user BYOK overrides via `user_settings.{ml_provider, ml_model, ml_api_key_encrypted}` — all three written atomically by `saveMlKey()`. The strategy returns raw `{ text, model, usage }`; `InvoicesService.parseInvoice` runs `parseGeminiResponse(text)` from `@warranty/shared` so all three providers land on the same `InvoiceParseResult` shape. Curated model catalog (id + description + key-gen URL) lives in `libs/shared/src/ml-models.ts` and powers the profile UI.
- `POST /api/webhooks/n8n/invoice` — file upload endpoint for n8n, handles storage + Gemini parse + draft creation in one call
- Private storage buckets (`invoices`) use `storage://` URI scheme. Client resolves via `GET /api/storage/signed-url`. Legacy public URLs also supported.
- `PdfViewer` component auto-sizes to container width via `ResizeObserver`
- Product delete modal shows product image and name for confirmation
- Invoice viewer opens in 80vw x 80vh modal with download button
- Product cards responsive grid: 1 (mobile) → 2 (sm) → 4 (lg) → 6 (2xl). Draft cards: 1 → 2 → 3.
- Dashboard and Products are separate pages. Dashboard: stats, charts, drafts. Products: timeline filter + grid with infinite scroll.
- Charts are interactive: spending bar click → products filtered by month, donut slice click → products filtered by warranty status.
- Main layout has no padding — each page manages its own `p-4 md:p-6`. Product form uses sticky header at `top-0`.
- All hardcoded strings replaced with `t()` calls. New strings must be added to all 3 locale files.
- Build artifacts (`dist/`, `.vite/`) are gitignored — do not commit them
- Header user menu is a `DropdownMenu` (email → Profile link → Log Out). Profile link navigates to `/profile`.
- `user_subscriptions` table (V3): `plan_id text` (external iSubscription ID), `plan_name text`, `status subscription_status enum`, `provider text` (renamed from `payment_provider`), `provider_subscription_id`, `provider_customer_id`, `started_at timestamptz not null`, `current_period_start/end`, `cancel_at_period_end`, `tenant_id text` (nullable, single-tenant deployment), `entitlements jsonb` (resolved feature map snapshot, written by the entitlements pkg adapter), `last_order_id`/`last_order_approve_url` (pending PayPal order tracking for `/capture` verification and renewal nudges). Unique index `(user_id, tenant_id) NULLS NOT DISTINCT`. RLS: users read own row only; service role writes.
- `entitlements_usage` table: `(id uuid pk, user_id, tenant_id, metric, period_start, amount, updated_at)` with unique index `(user_id, tenant_id, metric, period_start) NULLS NOT DISTINCT`. RLS self-read. **Currently dormant** — pre-staged for future metered features (token quotas, API rate caps). No running code reads or writes it yet.
- `entitlements_increment_usage_capped(uuid, text, text, timestamptz, int, int)` RPC: atomic upsert that raises `LIMIT_EXCEEDED` (errcode P0001) when the post-increment amount would exceed the cap. **Currently has zero callers** — defined as audit M2 hardening for when metered features are introduced. The entitlements pkg's default RPC `entitlements_increment_usage` is intentionally NOT created; any accidental `service.consume()` call will fail loudly with "function does not exist" rather than silently use the unsafe non-capped path.
