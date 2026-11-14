# `--api=rest|graphql|both`: GraphQL as a first-class API style

Status: design, awaiting approval. Date: 2026-11-14. Branch: `feature/api-graphql`.

## Intent

iCore is a constructor: every real decision (auth, db, upload, payment, jobs, ai, ui, transport, host) is an axis the user picks, and the generated project contains only what was picked. The API style is the next axis. Today the gateway (`apps/api`) is REST-only; people who want to build against GraphQL (mobile clients, third-party consumers, a typed React data layer) have to rip it out and rebuild it. The goal is that the user chooses the direction at generation time and gets a project that is complete for that direction, with the same security model (BFF session cookie, CSRF, CASL, throttling) as the REST one.

## Goals

- New axis `--api` (config key `api`, wizard question, recorded in `blueprint.json`): **`rest`** (default, today's output, unchanged), **`graphql`**, **`both`**.
- `graphql` = GraphQL replaces the REST surface of every feature that has a GraphQL surface (v1: `notes`, `profile`, `storage` metadata operations). Everything HTTP-inherent stays REST in every mode (see "Always REST").
- `both` = REST controllers and the GraphQL endpoint side by side (for projects that serve other consumers).
- The React client (all three templates: `client-shadcn`, `client-antd`, `client-mui`) uses **TanStack Query** (already the data layer) over a thin typed `gql` fetcher; with `--api=graphql` its `queries/*` hooks run on GraphQL with the same hook names, so pages do not change.
- A typed contract client <-> server: the gateway writes `apps/api/schema.gql` (code-first); the client keeps its operations in **`.graphql` files** (same convention as the sibling CBC project) loaded by `vite-plugin-graphql-loader`; `graphql-codegen` (`typescript` + `typescript-operations`, types only) generates the result/variable types from those files against the schema. CI fails when the committed schema or the generated types drift, or when an operation no longer validates against the schema.
- Security parity: the existing global guards (`ThrottlerGuard`, `AuthGuard`, `CsrfGuard`, `AbilityGuard`) protect GraphQL operations exactly as they protect controllers.

## Non-goals (v1, documented follow-ups)

Subscriptions (`graphql-ws`), federation, Yoga/Mercurius drivers, schema-first, persisted queries, multipart upload over GraphQL, GraphQL surfaces for `payment`, `ai`, `admin`, `--host=cloudflare`.

## Anti-goals (a result is a failure even if it compiles)

- `graphql` silently losing an endpoint: a feature's REST surface is dropped only if that feature has a GraphQL surface.
- The `rest` default output changing in behaviour or gaining GraphQL: no GraphQL dependency, file, endpoint or client code in a `rest` project. Neutral shared refactor files (`requestOf`, `@CurrentUser()`, extracted gateway services) ship in every mode; see "Decisions after the builder check".
- Weakening the BFF protections on `/graphql` (unauthenticated resolver, missing CSRF, no ability check, stack traces or introspection in production).
- A second copy of business rules (ownership, abilities) in resolvers.

## Constraints from the existing system

- Global guards read the request through `ctx.switchToHttp().getRequest()`; under GraphQL that is the wrong context.
- Controllers read the user from `@Req() req.user` (Express); auth is the opaque httpOnly `icore_sid` cookie plus `X-CSRF-Token` on every non-GET request.
- `@idevconn/api-client` (used by the client) refreshes the session on HTTP **401**. GraphQL by default answers errors with HTTP 200, so auth errors must be surfaced as HTTP 401 for the existing refresh flow to work.
- Generated projects are produced by the additive blueprint engine (units, `excludedPaths`, overlays, `blueprint.json`); there are no runtime "disabled" flags.
- Nest 12 is ESM-only, projects stay CommonJS (`nodenext`), `reflect-metadata` must be imported explicitly; `@nestjs/graphql` and `@nestjs/apollo` 14.2.1 target Nest 12 (`@apollo/server` 5, `graphql` 16/17).
- The client data layer is UI-library independent: `queries/notes.ts` is byte-identical in `client-shadcn`, `client-antd` and `client-mui`, imports no UI library (only TanStack Query, `react-i18next`, `@icore/template-shared`, and `api` from each `main.tsx`), so one GraphQL overlay serves all three. `host=cloudflare` rejects unsupported combinations with a clear error (precedent for validation errors).

## Approaches considered

1. **`.graphql` files + `vite-plugin-graphql-loader` + `graphql-codegen` types (chosen).** Operations live in dedicated files (editor support, build-time parsing, the convention already used in CBC); codegen generates the types and validates every operation against the schema; a small `operation<TData, TVars>(document, name)` helper pairs a loaded document with its generated types. Cost: a generation step, generated types committed, and the `graphql` package in the client bundle (needed to print documents).
2. `gql.tada`: types inferred from an introspection file, no generated code. Younger, depends on a TS plugin and type-instantiation cost.
3. Hand-written types: fewest dependencies, silent contract drift; weak for a constructor.

Axis semantics, decided with the owner: three values (`rest`, `graphql`, `both`); `both` is nearly free because REST and GraphQL surfaces are separate modules wired by the same generated file.

## Design

### 1. Surfaces: REST module vs GraphQL module per feature

The existing feature module (`NotesModule`, `StorageModule`, `ProfileModule`) **is** the REST surface and stays unchanged (controllers included). For each feature with a GraphQL surface add `<feature>/graphql/<feature>-graphql.module.ts` (resolvers + the same client/ability imports) next to it. `writeFeaturesWiring` (already generates `features.module.ts` / `app.module` imports) picks per `api`:

| `api`     | module imported for a feature with a GraphQL surface | features without one (`payment`, `ai`, `admin`, `auth`) |
| --------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `rest`    | REST module                                          | REST module                                             |
| `graphql` | GraphQL module                                       | REST module (unchanged)                                 |
| `both`    | REST module and GraphQL module                       | REST module                                             |

For `api=graphql` the REST controllers/modules of surfaced features are excluded from the copy (`excludedPaths`); for `api=rest` all GraphQL files are excluded.

### 2. Always REST

`auth` (login, register, refresh, logout, password reset, OAuth redirects: cookies and redirects are HTTP concerns), webhooks, `admin` (bull-board), `storage` upload and file streaming (multipart / binary), health, Swagger (documents the REST surface only; in `graphql` mode it documents what remains). GraphQL exposes `storage` list, signed-url and remove.

### 3. Gateway GraphQL module

`apps/api/src/app/graphql/graphql.module.ts` (only generated when `api != rest`): `GraphQLModule.forRoot<ApolloDriverConfig>` with `ApolloDriver`, code-first, `autoSchemaFile` -> `apps/api/schema.gql` (sorted), `path: '/graphql'`, context `{ req, res }`, introspection and GraphiQL **disabled when `NODE_ENV=production`** (same rule as Swagger), Apollo `csrfPrevention` on, production error masking (no stack traces), query depth / alias / batching limits (library or small custom validation rules: builder's choice, requirement is stated, see Security). Dependencies live in the `api` unit (`@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql`), merged only when selected, plus the matching entries in `_template-shell`/pins per the drift tests.

### 4. Context-neutral guards and decorators

One helper `requestOf(ctx: ExecutionContext)` (`apps/api/src/app/http/execution-context.ts`): `ctx.getType() === 'graphql'` -> `GqlExecutionContext.create(ctx).getContext().req`, otherwise `switchToHttp().getRequest()`. `AuthGuard`, `CsrfGuard`, `AbilityGuard` use it; a `ThrottlerGuard` subclass overrides `getRequestResponse`. A `@CurrentUser()` parameter decorator (works in controllers and resolvers) replaces ad-hoc `@Req() req.user` use in new code; existing controllers are not rewritten. `@Public()`, `@CheckAbility()` work on resolvers through `Reflector` unchanged. Every GraphQL operation is `POST /graphql`, so `CsrfGuard` requires `X-CSRF-Token` on all of them (queries included): documented, and the client already sends it on every non-GET.

### 5. Auth errors must be HTTP 401

An `UnauthorizedException` from `AuthGuard` inside GraphQL would be a 200 with `errors[]` and break the client's refresh-on-401. A `formatError` / exception mapping turns authentication failures into a `GraphQLError` with `extensions.code = 'UNAUTHENTICATED'` and `extensions.http.status = 401`; `ForbiddenException` -> `FORBIDDEN` / 403. This is the riskiest integration point and is verified first by an integration test (below).

### 6. No duplicated business rules

Notes ownership/ability logic and storage `assertOwnership` currently live inside controllers. Extract them into gateway application services (`NotesGatewayService`, reuse `assert-ownership.ts`) that both controllers and resolvers call; controllers become thin. Behaviour preserved, covered by the existing controller tests (which must pass unchanged before the resolvers are added). Resolvers: `NotesResolver` (queries `notes`, `note`; mutations `createNote`, `updateNote`, `deleteNote`), `ProfileResolver` (`me`), `StorageResolver` (`files`, `signedUrl`, `removeFile`). Object/input types are decorated classes under `<feature>/graphql/`; they map from the shared `Note` etc. types.

### 7. Schema and contract checks

`apps/api/scripts/emit-schema.ts` prints the schema without booting the app (`GraphQLSchemaBuilderModule` + `GraphQLSchemaFactory.create([...resolvers])`), wired as nx target `api:graphql-schema`. CI step: run it and `git diff --exit-code apps/api/schema.gql`; second step: run `client:graphql-codegen` (it also validates every `.graphql` operation against the schema and fails on an invalid one) and `git diff --exit-code` on the generated types file (same shape as `check-route-integrity`).

### 8. Client (all three UI templates)

- `src/api/graphql.ts`: `request<TData, TVars>(document, variables)` prints the document with `graphql`'s `print` and sends `api('/graphql', { method: 'POST', body: { query, variables, operationName } })` from `@idevconn/api-client` (token refresh, typed errors, CSRF/credentials as today), unwrapping `data` and turning `errors[]` into `ApiError`.
- **Operations** in `src/graphql/gql/*.graphql` (e.g. `notes.graphql`, `profile.graphql`), one file per domain; `vite-plugin-graphql-loader` (added to both `vite.config.mts` and `vitest.config.mts`) imports them as parsed documents; `graphql-loader.d.ts` declares `*.graphql` modules. A thin `src/graphql/*.queries.ts` per domain exports each operation through `operation<TData, TVars>(document, 'OperationName')` (extracts one operation by name, like CBC's `getOperation`, typed with `TypedDocumentNode` from `@graphql-typed-document-node/core`).
- `codegen.ts` (`@graphql-codegen/cli`, `typescript`, `typescript-operations` as client devDependencies) reads `../../apps/api/schema.gql` and `src/graphql/gql/*.graphql`, writes `src/gql/types.ts` (committed); nx target `client:graphql-codegen`.
- `api=graphql`: an overlay (the same files for `shadcn`, `antd` and `mui`) replaces `src/queries/notes.ts` and `src/queries/profile.ts` with GraphQL implementations that keep hook names and signatures (`useNotesList`, `useCreateNote`, `useProfile`, ...) on TanStack Query; pages and components are untouched. The profile page currently calls `api(...)` inline in each template's `routes/_dashboard/profile.tsx`; as a neutral refactor (all modes) that call moves into a shared `queries/profile.ts` hook first, so the overlay is one file. Auth forms stay on REST (cookies and redirects). Storage has no client usage today, so it needs no client overlay. The existing overlay mechanism of the engine (`applyAuthNoneVariants` pattern) is reused.
- `api=both`: the client keeps using REST; `/graphql` exists for other consumers.

### 9. `create-icore` changes

- `ApiStyle = 'rest' | 'graphql' | 'both'` in `lib/options.ts`; `--api` flag, `config.ts` allowed values, wizard question (default `rest`), `MANIFEST.api` units (deps, exclusion lists, overlays), `blueprint.json` records `api`; `create-icore migrate` unit matching extended to `api:<style>` like `ui:<unit>`.
- `validateOptions`: `api != rest` + `host=cloudflare` -> error (Apollo on workerd not verified).
- The repository itself keeps its production wiring at `rest`; the GraphQL modules, schema and client files exist in the repo and are exercised by tests and CI combos so the template snapshot contains them.

### 10. Security requirements (acceptance, not options)

Introspection and GraphiQL off in production; depth, alias-count and batching limits; error masking in production; every resolver behind the global `AuthGuard` unless `@Public()` (none in v1); `CsrfGuard` on every operation; `@CheckAbility` parity with the controllers (admin sees all notes, users own); throttling: the `default` 120 req/min floor applies to `/graphql`, and any future costly operation must declare its own named throttle (existing rule).

## Test plan

- Gateway: guard unit tests for both context types; **integration test** (Nest testing module + supertest, fake session store) for `/graphql`: unauthenticated -> HTTP 401 with `UNAUTHENTICATED`, missing CSRF header -> 403, ability denial -> `FORBIDDEN`, other user's note hidden, introspection rejected under `NODE_ENV=production`, depth limit enforced; resolver unit tests with fake clients; schema snapshot test.
- Controllers: existing tests unchanged and green after the service extraction (done first, as its own step).
- `create-icore`: `validateOptions` cases, `resolveBindings` exclusion lists for each `api` value, real-template scaffold tests: `rest` output identical to today's (golden file-list test), `graphql` has no notes/profile/storage controllers but has resolvers + `schema.gql`, `both` has both, `blueprint.json` records `api`, drift guards (`template-shell-drift`, `workspace-ownership`) green, audit clean.
- Client: hook tests for the GraphQL query files (`api` mocked); codegen drift check; each of the three UI templates must build and test with `api=graphql` (smoke combos cover shadcn, antd and mui).
- Smoke: new `pipeline.yml` combos (`--api=graphql` with each of `shadcn`/`antd`/`mui`, `--api=both`, `--api=graphql --ui=none`) and nightly legs (install mode + boot, plus a real `POST /graphql` round trip in the boot check or a dedicated script).
- Live verification before merge: a generated `--api=graphql` project booted with real session store, query and mutation through `/graphql` from the generated client in a browser (the repo has `chrome-devtools`/playwright available), and the 401-refresh path exercised once.

## Left to the builder

Apollo config details, which limits library (or custom validation rules) provides depth/alias/batching limits, exact schema type names and field shapes, codegen config details, nx target wiring, how the `api` unit lists its exclusion paths, the golden file-list mechanism, exact error-code mapping beyond 401/403.

## Decisions after the builder check (my calls, owner to confirm by approving this document)

1. **What "`rest` unchanged" means.** Behaviour and public surface are unchanged and no GraphQL artefact appears. The neutral shared refactor (`requestOf`, `@CurrentUser()`, `NotesGatewayService`, thin controllers) ships in **all** modes; it is plain refactoring covered by the existing controller tests, not gated by overlays. The golden test therefore asserts: (a) the `rest` file list equals today's list plus exactly those neutral files, (b) no path matching `*graphql*`, `schema.gql`, `codegen*`, `src/gql/` and none of the GraphQL dependencies.
2. **Feature matrix.** GraphQL surfaces exist per feature only if the feature exists: `notes` needs `example=notes`, `storage` needs `upload != none`, `profile` exists whenever `authProvider != none`. Because `api != rest` already requires auth, `profile`/`me` always exists, so the schema is never empty and no separate "nothing to expose" error is needed. Exclusions and client overlays are per feature file, keyed on (`api`, `example`, `upload`, `ui`): a file is excluded/overlaid only when its feature is present. `--api=graphql --example=none --upload=none` is valid (schema = `me`).
3. **Tests that call dropped REST endpoints.** Checked: `apps/api-e2e` has no spec files, `notes-e2e` talks to the notes microservice over the transport, the Playwright spec (`client-shadcn-e2e`) drives the UI (which transparently uses GraphQL through the overlay), and the scaffold boot check only watches that services stay up. Nothing needs to be excluded or swapped in v1; the plan re-verifies this with a grep for REST paths in generated test files. GraphQL-specific coverage comes from the gateway integration tests and the live round trip listed above.
4. **Generation-time axis only.** `api` is chosen at generation. `create-icore migrate` must not break projects that carry an `api` value (blueprint matching only); switching an existing project between styles is a non-goal (it would be a feature of its own).
5. **`api=both` and the client.** The client stays REST in `both`: no `graphql.ts`, no `.graphql` files or loader, no codegen config, no generated types. Those client files ship in `graphql` only. CI drift checks: schema drift (`schema.gql`) runs for every project with `api != rest`; codegen drift only for `graphql`.
6. **GraphQL code lives in the repo.** The template snapshot is a copy of the repo, so the GraphQL modules, `schema.gql` and client files must exist in the repo and be built, linted and tested by its own CI (and the schema-drift step runs against it). The repo's production wiring stays `rest`: the GraphQL modules are not imported there, so they are not part of the production bundle; the root `package.json` gains the GraphQL dependencies (and `_template-shell`, `yarn.lock` follow the drift rules). This is intended; keeping the code only in the snapshot is not workable because the snapshot is generated from the repo.

7. **Client scope: all three UI templates** (corrected after the owner questioned a first draft that limited GraphQL to `client-shadcn` by analogy with the AI dashboard; that analogy did not apply because the data layer has no UI-library code). Extra cost is the neutral `queries/profile.ts` extraction in each template and building/testing three templates.

8. **Operation files and loader (owner's choice, after seeing CBC).** `.graphql` files + `vite-plugin-graphql-loader` instead of inline tagged templates; the plugin version is the current one that supports Vite 8 (`6.0.0`, CBC runs `5.0.1`).
9. **`graphql` is pinned to 16 repo-wide.** `@apollo/server` 5 peers `graphql ^16.11`; `@nestjs/graphql`/`@nestjs/apollo` and the codegen packages accept 16 and 17, so 16 is the common version (17 is out, but would break the Apollo peer).
10. **GraphQL implementation files swap in by renaming.** The template ships both `queries/notes.ts` (REST) and the GraphQL implementation as `queries/notes.gql-api.ts`; a new generator step moves the latter over the former for `api=graphql` and drops it otherwise (same family as the existing auth-none variants, but file-based). Pages import `queries/notes` either way.

11. **`--api=graphql|both` is allowed with `auth=none`** (owner objected to the first draft, which made it an error: a primitive SPA without authentication must not be refused). Without auth there are no sessions, so there are no notes/profile/storage resolvers (they need a user): the GraphQL surface is a minimal **public `health` query** (`Query { health: Health! }`, always present in every GraphQL mode, also the smoke target) and the endpoint is the foundation the user adds their own resolvers to. In that mode the auth-bound global guards do not exist (they live in the auth module), so the endpoint is protected by the request-level throttle only, which is acceptable because there is no session to forge; `CsrfGuard` does not exist there either. The wizard asks the `--api` question for `auth=none` as well (it is skipped only for `host=cloudflare`). Storage's GraphQL surface exists only when `authProvider != none`.

12. **Throttling in `auth=none` projects (scope fixed by the owner: only the error is removed; `rest` output stays unchanged).** The `auth=none` gateway overlay (`GATEWAY_APP_MODULE_TS` in `tools/create-icore/src/lib/scaffold-auth-none.ts`) imports `ThrottlerModule.forRoot([{ name: 'auth-burst', ... }])` with no `default` throttler and no `APP_GUARD` (those live in `AuthModule`, removed by `auth=none`). That is existing behaviour for `rest` + `auth=none` and is NOT changed by this work (observation reported to the owner: that gateway has no effective rate limit). For `graphql` and `both` with `auth=none` the overlay variant registers the repo's `throttlerOptions` so the request-level GraphQL throttle middleware finds the `default` throttler (the middleware is request-level and needs no `APP_GUARD`).

## Open questions for the owner

None blocking after the builder check. Approving this document approves the decisions above.
