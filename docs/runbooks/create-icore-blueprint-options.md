# create-icore: blueprint options, combinations and how they resolve

Reference for the generator's **additive blueprint engine** (`tools/create-icore/src/manifest/`): every option, every allowed value, which
combinations are legal, what the generator auto-corrects, and what ends up on disk. Source of truth is the code — `lib/options.ts`
(`validateOptions`), `lib/config.ts` (allowed values), `lib/prompts.ts` (defaults + wizard), `manifest/resolve.ts` (units + excluded paths),
`lib/scaffold.ts` (pipeline). If this page disagrees with them, the code wins; fix the page.

## 1. How the engine works

The template snapshot (`tools/create-icore/templates/`) contains **everything**. Generation is subtractive on disk but additive in intent:

1. **Collect** — flags (`--auth=…`), then `--config file.json` (flags win), then wizard prompts for anything still missing.
2. **Validate** — `validateOptions()` returns `errors` (generation stops), `warnings`, and a `corrected` copy of the options.
3. **Resolve** — `resolveUnits()` maps the corrected options to a list of **units** from `MANIFEST` (`manifest/index.ts`). A unit declares what
   one choice contributes: `libDirs`, raw `deps`, `tsPaths`, an `envBlock`, a Nest `DynamicModule`, a gateway service entry, a client nav entry,
   a docker service, app-level `appTests`, and `toolFiles`.
4. **Exclude** — `resolveBindings()` turns every **inactive** unit's `libDirs` / `appTests` / `toolFiles` (plus the fixed lists for
   `auth=none`, `upload=none`, `host=cloudflare`) into `excludedPaths`. A path owned by an active unit is never excluded. `tools/` is dropped
   entirely when no active unit needs a script; `tools/create-icore` itself is never emitted.
5. **Copy + rewrite** — `scaffold()` copies the snapshot minus `excludedPaths`, then rewrites: root `package.json` (deps of active units only,
   broker driver for the transport, pm-specific fields), `.env` files, client template (`apps/templates/client-<ui>` promoted to `apps/client`),
   `docker-compose.yml` (transport / session / removed services), feature wiring (`features.module.ts`, `gateway-services.ts`, nav config),
   provider wiring (`auth.provider`, storage provider, `db.provider`), `apps/worker` wiring for the Cloudflare host, pnpm/npm/yarn specifics.
6. **Record** — `blueprint.json` at the project root (`schemaVersion`, every option, `generatorVersion`) and one small `blueprint.json` in each
   present service dir. This is provenance and the input for the audit and for `create-icore migrate`. No timestamps — output is deterministic.
7. **Audit** — `manifest/audit.ts` (run by the smoke tests) fails if generated code imports an absent `@icore/*` lib, or if the project still
   depends on the raw SDK of a provider that was **not** chosen (auth/db/upload).

Consequence: choosing less yields a smaller project. There are no "disabled" flags in generated code — an unchosen feature has no files,
no deps, no compose service, no env block.

Compose services follow the same rule for every optional microservice: `jobs`, `ai` and `payment` each have their `docker-compose.yml` service
block, the gateway `depends_on` entry, the gateway env keys and their `Dockerfile.ms-<name>` removed when the feature is `none`
(`dockerService` on the feature unit in `manifest/index.ts`, stripped in `manifest/wire-features.ts`). Every `dockerfile:` the compose file
builds must be in the file list of `scripts/snapshot-templates.mjs`; `snapshot-dockerfiles.unit.test.ts` pins that. Before this was fixed
(`Dockerfile.ms-payment` was missing from the snapshot and the payment service was never stripped) `payment=paypal` generated a compose file
that could not `docker compose build` and `payment=none` kept a dangling `payment` service.

## 2. Options

| Flag (config key)                      | Values                                                                 | Default / when skipped                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--host` (`host`)                      | `node`, `cloudflare`                                                   | wizard asks; `node`                                                                   |
| `--auth` (`authProvider`)              | `supabase`, `firebase`, `mongodb`, `postgres`, `none`                  | wizard asks                                                                           |
| `--db` (`dbProvider`)                  | `supabase`, `firebase`, `mongodb`, `postgres`, `sqlite`, `d1`, `none`  | `none` if `auth=none`; `d1` on cloudflare; else wizard (preselects the auth provider) |
| `--upload` (`upload`)                  | `supabase`, `firebase`, `cloudinary`, `minio`, `r2`, `mongodb`, `none` | wizard asks                                                                           |
| `--payment` (`payment`)                | `paypal`, `none`                                                       | `none`                                                                                |
| `--jobs` (`jobs`)                      | `bullmq`, `none`                                                       | `none`                                                                                |
| `--ai` (`ai`)                          | `llm-router`, `none`                                                   | `none`                                                                                |
| `--example` (`example`)                | `notes`, `none`                                                        | `none` if `auth=none`; else wizard (`notes`)                                          |
| `--ui` (`ui`)                          | `shadcn`, `antd`, `mui`, `none`                                        | wizard (`shadcn`); `none` = API-only, no client                                       |
| `--transport` (`transport`)            | `tcp`, `redis`, `nats`, `mqtt`, `rmq`, `kafka`, `local`                | `local` on cloudflare; `tcp` if no microservice; else wizard (`tcp`)                  |
| `--session` (`session`)                | `redis`, `memory`, `durable-object`                                    | `redis` if `auth=none`; `durable-object` on cloudflare; else wizard (`redis`)         |
| `--package-manager` (`packageManager`) | `yarn`, `npm`, `pnpm`                                                  | detected from `npm_config_user_agent`, else `yarn`                                    |
| `--no-git`, `--no-install`             | booleans (`initGit`, `install` in config)                              | git init + install on                                                                 |
| `--config <file>`                      | JSON file with the config keys above                                   | flags override file values                                                            |

`--storage` is a deprecated alias of `--upload`. Unknown flags warn and are ignored; out-of-range values fail with the allowed list.

## 3. Validation rules (exactly what `validateOptions` does)

**Errors — generation stops**

| Condition                                                                     | Message gist                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `host=node` + `transport=local`                                               | `local` is in-process, needs `--host=cloudflare` |
| `host=node` + `session=durable-object`                                        | needs `--host=cloudflare`                        |
| `host=cloudflare` + `auth` not `supabase`/`none`                              | unsupported                                      |
| `host=cloudflare` + `db` not `d1`/`none`                                      | unsupported                                      |
| `host=cloudflare` + `upload` not `r2`/`none`                                  | unsupported                                      |
| `host=cloudflare` + `payment`/`jobs`/`ai` ≠ `none`                            | unsupported                                      |
| `host=cloudflare` + explicit transport other than `local`/default `tcp`       | unsupported                                      |
| `host=cloudflare` + auth ≠ none + session other than `durable-object`/`redis` | unsupported                                      |
| `host=cloudflare` + `ui=none`                                                 | unsupported (the Worker serves the built client) |

**Auto-corrections (with a warning where noted)**

| Input                             | Result                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `host=cloudflare`                 | `transport := local`; `session := durable-object` (or `redis` placeholder when `auth=none`) |
| `auth=none` + `example=notes`     | `example := none` (warning: notes needs auth / CASL / AuthGuard)                            |
| `auth=none` + `session` ≠ `redis` | `session := redis` (warning: no sessions without auth)                                      |

**Warning only (not corrected)**

- Every option `none` (`auth`, `db`, `upload`, `payment`, `jobs`, `ai`, `example`, `ui`): a notice says only the bare NestJS gateway (`apps/api`) is generated. Generation continues.
- `jobs=bullmq` with `transport` ≠ `redis`: BullMQ needs Redis. The compose file still gets Redis for the jobs stack, but you own making sure a
  Redis is reachable.

**Also an error:** `db=none` + `example=notes` with auth ≠ none (`--example=notes needs a database…`). The notes sample persists through a
`DBStrategy`; without a db its `db.provider.ts` would import a pruned `@icore/db-*` lib and the generated project would fail the scaffold audit
(this was silently generated before). `auth=none` is unaffected: `example` is corrected to `none` first. Any `auth`/`db`/`upload` mix across
providers is otherwise allowed (e.g. `auth=supabase db=d1 upload=r2` keeps Supabase for identities only); there is no "must match" rule.

## 4. What each axis does

### Host

- **`node`** — gateway (`apps/api`) + one process per microservice, Dockerfiles, `docker-compose.yml`, nginx for the client.
- **`cloudflare`** — one Worker (`apps/worker`) hosts the gateway modules and the auth/upload/notes microservices in one isolate over
  `X_TRANSPORT=local`; sessions + throttling in Durable Objects; optional D1 binding. Drops Dockerfiles/compose/nginx/`.dockerignore`, writes
  `.github/workflows/deploy-cloudflare.yml` and an `assets` binding for the built client. `apps/worker/src/hosted-apps.ts` and wrangler vars are
  regenerated for the chosen features. See `cloudflare-workers-host.md`.

### Auth (`--auth`)

`supabase` / `firebase` / `mongodb` / `postgres` pick the `AuthStrategy` lib under `libs/auth-strategies/*` and the matching `AUTH_PROVIDER`.
`none` removes the auth microservice, `libs/auth-strategies`, `libs/auth-client`, gateway `auth`/`profile`/`abilities`, CASL, login routes and
client auth components, and overlays "auth-none" variants of the files that referenced them (`scaffold-auth-none.ts`). Result: open API, no
sessions, no CSRF cookie flow, `example` forced to `none`.

### DB (`--db`)

Each value keeps only its `libs/db-strategies/<name>`; the others are removed. The notes sample (and AI usage tracking) use it through the
`DBStrategy` contract. `postgres` shares `POSTGRES_URL` with `auth=postgres` — one instance covers both. `d1` is Cloudflare D1 (REST on
Node, binding inside a Worker). `none` with `auth=none` is the default; with `ai` enabled, usage tracking falls back to an in-memory
`FakeDBStrategy` `NullDbModule`. A chosen db with `example=none` still ships the strategy lib but does not wire a `db.provider` for notes.

### Upload (`--upload`)

Selects one `libs/storage-strategies/*`. `none` removes the upload microservice, `libs/upload-client`, `libs/storage-strategies`, the gateway
`storage` module and `Dockerfile.ms-upload`. Ownership prefix (`<userId>/…`) is enforced in code by every strategy.

### Payment / Jobs / AI (optional features)

| Feature          | Adds                                                                                    | Notes                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `payment=paypal` | payment microservice + `libs/payment-client` + `@idevconn/payment`                      | node host only                                                                                |
| `jobs=bullmq`    | jobs microservice, BullMQ, bull-board at `/api/admin/queues` (admin-session gated)      | needs Redis; node host only; `@bull-board/*` pinned in `apps/api/package.json` + manifest     |
| `ai=llm-router`  | ai-orchestrator microservice, `libs/ai-client`, `/api/ai/*`, usage tracking, RAG opt-in | needs a DBStrategy (real one if `db` set, in-memory `NullDbModule` otherwise); node host only |

### Example

`notes` adds the notes microservice, `libs/db-strategies` wiring, gateway module and client route as an end-to-end demo. Remove before production.

### UI

`shadcn` | `antd` | `mui`: `apps/templates/client-<ui>` is promoted to `apps/client`; the other two are deleted. Feature exclusions apply to all three
template trees.

### Transport (gateway ↔ microservices)

| Value   | Needs                | Effect on the project                                                  |
| ------- | -------------------- | ---------------------------------------------------------------------- |
| `tcp`   | nothing              | default; compose `*_TRANSPORT` flipped from the templated `redis`      |
| `redis` | Redis                | compose left as templated                                              |
| `nats`  | NATS server          | adds `nats` driver dep; compose rewritten, redis URL dropped           |
| `mqtt`  | MQTT broker          | adds `mqtt` driver dep                                                 |
| `rmq`   | RabbitMQ             | adds `amqplib` + `amqp-connection-manager`; queues are `durable: true` |
| `kafka` | Kafka                | adds `kafkajs`                                                         |
| `local` | Cloudflare host only | in-process `LocalServer` / `LocalClientProxy`; no host/port/url vars   |

gRPC is intentionally not offered (needs `.proto` contracts, incompatible with the message-pattern layer). When no microservice remains
(`auth=none`, `upload=none`, `payment=none`, `ai=none`) the wizard skips the question and uses `tcp`; if additionally `db=none`, the strategies
lib and `apps/microservices/` are removed entirely.

### Session (`--session`)

| Value            | Behaviour                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `redis`          | default; `SESSION_REDIS_URL` required, boot fails fast without it; survives restarts, several gateway instances                                                                                                                         |
| `memory`         | `SESSION_STORE=memory`: no Redis for sessions, loud boot warning, `SESSION_STORE_ALLOW_MEMORY=true` needed in production, one instance only, restart = everyone logs out. Compose drops Redis unless `jobs=bullmq` or `transport=redis` |
| `durable-object` | Cloudflare host only (implied)                                                                                                                                                                                                          |

### Package manager

- **yarn** (default): Yarn 4, `nodeLinker: node-modules`. Note the 24 h publish-age gate on fresh releases.
- **npm**: writes `.npmrc` with `legacy-peer-deps=true`; strips yarn files.
- **pnpm**: writes `pnpm-workspace.yaml` with `shamefullyHoist: true` (built microservice bundles resolve externals from the ROOT
  `node_modules`) and `allowBuilds` for native/postinstall packages (`esbuild` + `workerd` for wrangler, `argon2`, `bcrypt`, `nx`, …);
  rewrites `@icore/*` deps to `workspace:*`.

## 5. Combination space

Raw (before auto-correction collapses duplicates), per package manager and UI:

| Host                | Constraint-reduced axes                                                                                 | Combinations |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| `node`, auth ≠ none | 4 auth × 7 db × 7 upload × 2 payment × 2 jobs × 2 ai × 2 example × 6 transport × 2 session              | 37 632       |
| `node`, auth = none | 7 db × 7 upload × 2 × 2 × 2 (payment/jobs/ai) × 1 example × 6 transport × 1 session                     | 2 352        |
| `cloudflare`        | auth {supabase: 2 db × 2 upload × 2 example; none: 2 db × 2 upload × 1} — transport/session are implied | 12           |

Multiply by 3 UI libraries and 3 package managers: **≈ 360 000** valid-by-validator projects on Node, **108** on Cloudflare. Nobody tests all of
them; correctness rests on the manifest being additive (units are independent) plus the covering sets below.

### Representative combinations

| Goal                       | Command                                                                                                 | Result                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Full default stack         | `--auth=supabase --db=supabase --upload=supabase --example=notes`                                       | gateway + auth + upload + notes MS, Redis sessions, tcp             |
| Simple SPA, no login       | `--auth=none --upload=none`                                                                             | gateway + client only, no MS, no Redis; `example`/`session` ignored |
| Firebase everything        | `--auth=firebase --db=firebase --upload=firebase`                                                       | shared `libs/firebase-admin` kept                                   |
| Self-hosted, no SaaS       | `--auth=postgres --db=postgres --upload=minio`                                                          | one `POSTGRES_URL`, MinIO in compose                                |
| Mongo everywhere           | `--auth=mongodb --db=mongodb --upload=mongodb`                                                          | GridFS storage, `MONGODB_URI`                                       |
| No Redis at all            | `--session=memory --transport=tcp` (no `jobs`)                                                          | Redis removed from compose; single gateway instance                 |
| Broker-based MS            | `--transport=nats` (or `mqtt`/`rmq`/`kafka`)                                                            | driver dep added, compose `*_TRANSPORT` rewritten                   |
| Jobs + AI                  | `--jobs=bullmq --ai=llm-router --transport=redis`                                                       | bull-board + ai-orchestrator, Redis shared                          |
| Cloudflare Worker          | `--host=cloudflare --auth=supabase --db=d1 --upload=r2 --example=notes`                                 | `apps/worker`, DO sessions, D1 binding, R2 storage, no Docker files |
| Cloudflare Worker, minimal | `--host=cloudflare --auth=none --db=none --upload=none`                                                 | Worker serving the SPA + gateway only                               |
| Rejected                   | `--host=cloudflare --auth=firebase`, `--host=node --transport=local`, `--host=cloudflare --jobs=bullmq` | error before any file is written                                    |
| Silently corrected         | `--auth=none --example=notes`                                                                           | `example` becomes `none` + warning                                  |

## 6. How it is verified

- **Unit** — `tools/create-icore/src/**/__tests__` (412 tests): validation, resolver, excluded paths, wiring, pnpm workspace file.
- **Layer A (every PR)** — `scaffold-smoke` job: a covering set of combos, `--mode=link` (symlinked `node_modules`), `tsc --noEmit` on the
  generated tsconfigs + manifest audit. Catches dangling refs and bad pruning, not install/runtime problems.
- **Layer B (nightly)** — `Scaffold Smoke Matrix`: package manager × covering combos (including cloudflare combos), real install, real
  `nx build`, boots services; Cloudflare combos also run `worker:smoke`. Catches pm-specific problems (pnpm `ERR_PNPM_IGNORED_BUILDS`,
  hoisting) that link mode cannot see.
- Run one combo locally:

```bash
yarn nx build create-icore
node tools/create-icore/scripts/snapshot-templates.mjs
node tools/create-icore/scripts/smoke-scaffold.mjs --host=cloudflare --auth=none --db=none --upload=none \
  --transport=local --session=durable-object --pm=pnpm --mode=install
```

See `scaffold-smoke-tests.md` for the matrix definition.

## 7. Adding a new option value (checklist)

1. Type in `lib/options.ts`, allowed list in `lib/config.ts`, flag in `lib/prompts.ts` (wizard + `parseFlags`).
2. A `Unit` in `manifest/index.ts` (`libDirs`, `deps`, `tsPaths`, `envBlock`, `appTests`); register it in `MANIFEST`, and in
   `resolveUnits` / `resolveBindings`'s candidate list.
3. Cross-axis rule in `validateOptions` (error vs. auto-correction vs. warning) with a unit test.
4. Any wiring step in `scaffold.ts` (`wire-*.ts`) and the `blueprint.json` field.
5. `appTests` for app-level tests that import the new lib (else the scaffold-smoke audit fails).
6. Extend the Layer A/B covering set, `package.json` dep in `_template-shell` if shared (`template-shell-drift` test), changeset, this page.

## ui=none (API-only)

`--ui=none` generates no React client. Path exclusion lives in `UI_NONE_EXCLUDED_PATHS` (`manifest/resolve.ts`): `apps/templates`, `apps/client`,
`Dockerfile.client`, `nginx.client.conf`, `libs/template-shared`, `libs/vite-plugins`. On top of that `scaffold()` skips every client step
(template promotion, client `.env`, nav config, auth-none UI variants, `apps/client/blueprint.json`), strips the `@icore/template-shared` and
`@icore/vite-plugins` aliases from `tsconfig.base.json`, and `pruneClientDeps` removes client-only dependencies from the root `package.json`
(only those no remaining code or config file still references). The Nx plugins `nx.json` registers (`@nx/vite`, `@nx/vitest`, `@nx/playwright`), `vite` and
`@playwright/test` stay. `@nx/react` is pruned too (nx.json only lists it under `generators`; its peers would reinstall React). README, the root `dev` hint and the post-scaffold "Next" output drop the client (`:4200`);
the CLI points at the gateway Swagger (`:3001/api/docs`) instead.

Combos in CI: `ui-none` and `ui-none-minimal` in `pipeline.yml` (typecheck) and `supabase-api-only-tcp` in `scaffold-smoke-matrix.yml` (install + build + boot).
Not covered: a gateway-less project (`--gateway=none`) is a separate, larger change.
