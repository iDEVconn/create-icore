# `--api=rest|graphql|both` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generated project can be `rest` (today), `graphql` (GraphQL replaces the REST surface of notes/profile/storage metadata, client on TanStack Query + `.graphql` files) or `both`, with the same session/CSRF/CASL/throttle protection on `/api/graphql`.

**Architecture:** Neutral refactors first (context-neutral guards, extracted gateway service, split storage controller), then a repo-resident GraphQL surface (Apollo code-first, resolvers delegating to the same client services) and a repo-resident client data layer, then the `create-icore` axis that includes/excludes/swaps those files. The repo's own production wiring stays `rest`; the GraphQL code is built, linted and tested but not imported there.

**Tech Stack:** NestJS 12, `@nestjs/graphql` + `@nestjs/apollo` 14.2.1, `@apollo/server` 5.5.2, `graphql` ^16.11.0, TanStack Query, `vite-plugin-graphql-loader` ^6.0.0, `@graphql-codegen/cli` ^8.0.0 + `typescript` / `typescript-operations` ^7.0.1, `@graphql-typed-document-node/core` ^3.2.0, vitest, Nx, yarn 4.

**Spec:** `docs/superpowers/specs/2026-11-14-api-graphql-axis-design.md` (approved). Executors read it with this plan.

## Global Constraints

- Branch `feature/api-graphql` (exists, spec committed). Commit after each task; push and open the PR only after Task 9; the PR targets `dev` (`gh pr create --base dev`); never merge.
- Every PR needs `.changeset/<slug>.md` (`"@idevconn/create-icore": minor`); added in Task 8.
- `graphql` pinned to `^16.11.0` repo-wide (`@apollo/server` 5 peers `^16.11`).
- GraphQL endpoint path `/api/graphql` (`useGlobalPrefix: true`; the gateway sets `app.setGlobalPrefix('api')`), so the client base URL, dev proxy and the Worker `run_worker_first: ["/api/*"]` cover it.
- `rest` projects get **no** GraphQL dependency, file, endpoint or client code. Neutral refactor files ship in every mode and must not import `@nestjs/graphql`.
- Introspection and GraphiQL disabled when `NODE_ENV=production`; error masking in production; depth and alias limits; batching off (`allowBatchedHttpRequests: false`).
- Auth failures inside GraphQL must answer HTTP **401** (`extensions.code = 'UNAUTHENTICATED'`), forbidden HTTP 403 (`'FORBIDDEN'`).
- React rules of `AGENTS.md`: one component per file; `SyntheticEvent<HTMLFormElement>` not `FormEvent`.
- Post-coding routine per task before commit: `npx prettier --write <touched>`; `yarn nx lint <project>`; `yarn nx build <project>`; update docs in Task 8.
- Dependency bumps: edit root `package.json`, `yarn install`, `node tools/create-icore/scripts/sync-template-shell.mjs`, keep `tools/create-icore/src/manifest/index.ts` versions equal, commit `yarn.lock`.
- Tests: vitest, `*.unit.test.ts` in `__tests__/` next to the source.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the spec implies but a straightforward build would not test; each has a pinning test in the task named.

1. GraphQL **GET** requests and CSRF (`CsrfGuard` treats GET as safe): a mutation sent as `GET /api/graphql?query=mutation…` must be rejected (Apollo rejects mutations over GET; CSRF prevention needs a preflight header). Pinned in Task 3.
2. **Batched operations** (a JSON array body) bypassing per-request depth/alias rules: batching must be off. Task 3.
3. **Alias/field duplication** (`{ a: me { … } b: me { … } … }` ×1000): alias-count limit. Task 3.
4. **Admin vs owner parity**: the notes list for an admin returns all notes, for a user only their own, identical to the REST controller; a forbidden update returns `FORBIDDEN`. Task 4.
5. **Production leaks**: with `NODE_ENV=production` introspection fails and error `extensions` carry no stack trace. Task 3.
6. **Empty-ish projects**: `--api=graphql --example=none --upload=none` (schema = `me` only) must scaffold, typecheck and boot. Task 7.
7. **Mixed REST/GraphQL client state**: after a GraphQL mutation the TanStack Query cache for the same key is invalidated like the REST hook did. Task 6.

---

### Task 1: Context-neutral request access (all modes)

**Files:**

- Create: `apps/api/src/app/http/execution-context.ts`, `apps/api/src/app/http/current-user.decorator.ts`, `apps/api/src/app/http/context-aware-throttler.guard.ts`
- Modify: `apps/api/src/app/auth/auth.guard.ts`, `apps/api/src/app/http/csrf.guard.ts`, `apps/api/src/app/abilities/ability.guard.ts`, `apps/api/src/app/auth/auth.module.ts` (APP_GUARD `ThrottlerGuard` -> `ContextAwareThrottlerGuard`)
- Test: `apps/api/src/app/http/__tests__/execution-context.unit.test.ts`, extend `csrf.guard.unit.test.ts`, `ability.guard.unit.test.ts`, add an `AuthGuard` graphql-context case

**Interfaces:**

- Produces: `requestOf<R extends object = Request>(ctx: ExecutionContext): R` (http: `switchToHttp().getRequest()`; any other type: `ctx.getArgByIndex(2).req`, i.e. the GraphQL context, without importing `@nestjs/graphql`); `responseOf<R extends object = Response>(ctx): R`; `CurrentUser: () => ParameterDecorator` resolving `VerifiedToken | undefined` from `requestOf(ctx).user`; `class ContextAwareThrottlerGuard extends ThrottlerGuard` overriding `protected getRequestResponse(ctx: ExecutionContext): { req: Record<string, any>; res: Record<string, any> }`.

- [ ] **Step 1: Write failing tests.** `execution-context.unit.test.ts`: (a) `requestOf` on an http context stub (`getType: () => 'http'`, `switchToHttp: () => ({ getRequest: () => req })`) returns `req`; (b) on `{ getType: () => 'graphql', getArgByIndex: (i) => i === 2 ? { req, res } : undefined }` returns `req`, `responseOf` returns `res`. In `csrf.guard.unit.test.ts` add: graphql-type context with `req.method === 'POST'` and no token -> throws `ForbiddenException('csrf_mismatch')`; with a valid token (reuse the existing helper) -> `true`. In `ability.guard.unit.test.ts`: graphql-type context, user without the rule -> `ForbiddenException`. In an `AuthGuard` test: graphql-type context without a session cookie -> `UnauthorizedException('missing_session')`. `context-aware-throttler.guard.unit.test.ts`: `getRequestResponse` returns `{ req, res }` for an http stub and for a graphql stub (`getArgByIndex(2)`).
- [ ] **Step 2: Run** `yarn nx test api -- execution-context csrf.guard ability.guard auth.guard` -> FAIL (module missing / `switchToHttp` is not a function on the graphql stub).
- [ ] **Step 3: Implement** the three files and switch the three guards to `requestOf`. `ContextAwareThrottlerGuard.getRequestResponse` returns `{ req: requestOf(ctx), res: responseOf(ctx) }`.
- [ ] **Step 4: Run** the same command plus `yarn nx test api` -> PASS (all existing api tests unchanged).
- [ ] **Step 5: Commit** `refactor(api): make guards independent of the execution-context type`.

### Task 2: Neutral gateway refactor (notes service, storage controller split)

**Files:**

- Create: `apps/api/src/app/notes/notes-gateway.service.ts`, `apps/api/src/app/storage/storage-files.controller.ts`, `apps/api/src/app/storage/storage.controllers.ts`
- Modify: `apps/api/src/app/notes/notes.controller.ts`, `notes.module.ts`, `apps/api/src/app/storage/storage.controller.ts`, `storage.module.ts`
- Test: existing `notes/__tests__/notes.controller.unit.test.ts` (unchanged, must stay green), new `notes/__tests__/notes-gateway.service.unit.test.ts`

**Interfaces:**

- Produces: `NotesGatewayService` (`@Injectable`, deps `NotesClientService`, `AbilityFactory`) with `list(user: VerifiedToken | undefined, q: { limit?: number; offset?: number }): Promise<{ items: Note[]; total: number }>` (same clamping as the controller: limit <= 100 default 20, offset >= 0), `get(user, id): Promise<Note>` (`NotFoundException`, `ForbiddenException` on `read`), `create(user, input: { title: string; body: string }): Promise<Note>` (`ForbiddenException` without user), `update(user, id, patch)`, `remove(user, id): Promise<void>` (abilities `update` / `delete` on `subject('Note', note)`). `StorageFilesController` = `upload` + `file` handlers moved verbatim; `StorageController` keeps `signed-url`, `remove`, `list`; `STORAGE_REST_CONTROLLERS = [StorageFilesController, StorageController]` exported from `storage.controllers.ts` and used as `StorageModule.controllers`.

- [ ] **Step 1: Run the existing controller tests** `yarn nx test api -- notes.controller assert-ownership` -> PASS (baseline).
- [ ] **Step 2: Write failing tests** for `NotesGatewayService` with a fake `NotesClientService` and a real `AbilityFactory`: admin `list` passes `ownerId: null`, user passes `ownerId: user.uid`; `get` of another user's note -> `ForbiddenException`; `get` missing -> `NotFoundException`; `create` without user -> `ForbiddenException`; `update`/`remove` ownership; limit clamped to 100.
- [ ] **Step 3: Run** `-- notes-gateway` -> FAIL.
- [ ] **Step 4: Implement** the service; rewrite `NotesController` to delegate (routes, decorators and status codes unchanged, `@CheckAbility('create','Note')` stays); register the service in `NotesModule.providers` and `exports`. Split the storage controller and add the registry.
- [ ] **Step 5: Run** `yarn nx test api` -> PASS, controller tests untouched; `yarn nx build api` -> green.
- [ ] **Step 6: Commit** `refactor(api): extract NotesGatewayService and split the storage controller`.

### Task 3: GraphQL foundation (module, limits, error mapping, schema emitter)

**Files:**

- Create: `apps/api/src/app/graphql/graphql.module.ts` (`ApiGraphqlModule`), `graphql-limits.ts`, `graphql-error.filter.ts`, `apps/api/scripts/emit-schema.ts`
- Modify: root `package.json` (+ `yarn.lock`, `_template-shell` sync): `@nestjs/graphql ^14.2.1`, `@nestjs/apollo ^14.2.1`, `@apollo/server ^5.5.2`, `graphql ^16.11.0`; `apps/api/package.json` (declare the same four); `apps/api/project.json` or inferred target `graphql-schema` (`nx:run-commands`: `ts-node`/`tsx` run of `emit-schema.ts`, check how other repo scripts run first)
- Test: `apps/api/src/app/graphql/__tests__/graphql.integration.unit.test.ts`, `graphql-limits.unit.test.ts`

**Interfaces:**

- Produces: `ApiGraphqlModule` (`GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: <join(process.cwd(), 'apps/api/schema.gql')> in non-production else true, sortSchema: true, useGlobalPrefix: true, path: 'graphql', context: ({ req, res }) => ({ req, res }), introspection: false and `graphiql`off when`NODE_ENV === 'production'`, `allowBatchedHttpRequests: false`, `csrfPrevention: true`, `validationRules: createLimitRules({ maxDepth: 8, maxAliases: 15 })`, `formatError` masking stack traces in production })`); `createLimitRules(opts: { maxDepth: number; maxAliases: number }): ValidationRule[]`; `GraphqlErrorFilter` (`@Catch(HttpException)`, handles only `host.getType() === 'graphql'`, rethrows `new GraphQLError(message, { extensions: { code, http: { status } } })` with `UnauthorizedException` -> `UNAUTHENTICATED`/401, `ForbiddenException` -> `FORBIDDEN`/403, `NotFoundException` -> `NOT_FOUND`/404, other `HttpException` -> `BAD_USER_INPUT`/status) registered via `APP_FILTER` inside `ApiGraphqlModule`; `emitSchema(): Promise<string>` (printed SDL) used by `emit-schema.ts` and the snapshot test.

- [ ] **Step 1: Add the dependencies** (Global Constraints routine) and run `yarn install --immutable`.
- [ ] **Step 2: Write the failing integration test** (Nest testing module = `ApiGraphqlModule` + a throwaway `@Resolver` exposing `Query ping: String` and `Mutation touch: String`, real `AuthGuard`/`CsrfGuard`/`ContextAwareThrottlerGuard` as `APP_GUARD`s with a fake `SESSION_STORE` and fake `AuthClientService`, `cookie-parser`, `app.setGlobalPrefix('api')`, supertest):
  - no session cookie: `POST /api/graphql` `{ query: '{ ping }' }` -> **HTTP 401**, body `errors[0].extensions.code === 'UNAUTHENTICATED'`;
  - valid session cookie, POST without `X-CSRF-Token` -> HTTP 403 (`csrf_mismatch` mapped to `FORBIDDEN`); with the token -> 200 and `data.ping`;
  - `GET /api/graphql?query=mutation{touch}` -> not executed (4xx), even with a session;
  - body `[{query:'{ping}'},{query:'{ping}'}]` -> rejected (batching off);
  - query over the depth limit and a query with more than 15 aliases -> validation error, resolver not called;
  - with `process.env.NODE_ENV = 'production'` at module build: `{ __schema { types { name } } }` -> error; thrown `Error('boom')` in a resolver -> `errors[0].extensions` has no `stacktrace`.
    `graphql-limits.unit.test.ts`: `createLimitRules` flags depth 9, accepts depth 8; flags 16 aliases.
- [ ] **Step 3: Run** `yarn nx test api -- graphql` -> FAIL (module missing).
- [ ] **Step 4: Implement** `graphql-limits.ts` (two small `ValidationRule`s, no extra dependency), the filter, the module; add `emit-schema.ts` using `GraphQLSchemaBuilderModule` + `GraphQLSchemaFactory.create([...])` so it prints without booting the app.
- [ ] **Step 5: Run** `yarn nx test api` -> PASS; `yarn nx lint api`, `yarn nx build api` -> green. Confirm `ApiGraphqlModule` is **not** imported by `app.module.ts` (production unchanged).
- [ ] **Step 6: Commit** `feat(api): GraphQL foundation (Apollo module, limits, HTTP status mapping)`.

### Task 4: Resolvers, models and the committed schema

**Files:**

- Create: `apps/api/src/app/notes/graphql/{note.model.ts,note.inputs.ts,notes.resolver.ts,notes-graphql.module.ts}`, `apps/api/src/app/profile/graphql/{profile.model.ts,profile.resolver.ts,profile-graphql.module.ts}`, `apps/api/src/app/storage/graphql/{storage.model.ts,storage.resolver.ts,storage-graphql.module.ts}`, `apps/api/src/app/graphql/api-surfaces.module.ts`, `apps/api/schema.gql` (generated, committed), `apps/api/src/app/storage/storage.controllers.graphql.ts`
- Test: `apps/api/src/app/{notes,profile,storage}/graphql/__tests__/*.resolver.unit.test.ts`, `apps/api/src/app/graphql/__tests__/schema.unit.test.ts`, extend the integration test with a notes ability matrix

**Interfaces:**

- Consumes: `NotesGatewayService` (Task 2), `CurrentUser` (Task 1), `ApiGraphqlModule` (Task 3), `assertOwnership`, `UploadClientService`.
- Produces: code-first types `Note` (`id`, `ownerId`, `title`, `body`, `createdAt`, `updatedAt` as `String`), `NotePage { items: [Note!]!, total: Int! }`, `Profile { uid, email, role }`, `StorageRef { bucket, path }`; `NotesResolver`: `Query notes(limit: Int, offset: Int): NotePage!`, `Query note(id: ID!): Note!`, `Mutation createNote(input: CreateNoteInput!): Note!`, `Mutation updateNote(id: ID!, input: UpdateNoteInput!): Note!`, `Mutation deleteNote(id: ID!): Boolean!`; `ProfileResolver`: `Query me: Profile!`; `StorageResolver`: `Query files(prefix: String): [StorageRef!]!`, `Query signedUrl(bucket: String!, path: String!, ttlSec: Int): String!`, `Mutation removeFile(bucket: String!, path: String!): Boolean!`; `ApiSurfacesModule` imports `ApiGraphqlModule`, `NotesGraphqlModule`, `ProfileGraphqlModule`, `StorageGraphqlModule` (storage module also exports `UploadClientModule`); `storage.controllers.graphql.ts` exports `STORAGE_REST_CONTROLLERS = [StorageFilesController]` (the swap file of Task 7).

- [ ] **Step 1: Write failing tests.** Resolver units with fakes (delegate to the service/clients, map errors). Integration additions (real `NotesGatewayService`, fake notes client): user A `notes` returns only A's notes, admin returns all, user B `updateNote` on A's note -> HTTP 200 body `errors[0].extensions.code === 'FORBIDDEN'` with **status 403**, `deleteNote` missing id -> `NOT_FOUND`/404; `signedUrl` for another user's path -> `FORBIDDEN`; `me` returns the session user. `schema.unit.test.ts`: `emitSchema()` equals the content of `apps/api/schema.gql`.
- [ ] **Step 2: Run** `yarn nx test api -- graphql resolver schema` -> FAIL.
- [ ] **Step 3: Implement** models, inputs, resolvers (all logic delegated; no new rules), the three GraphQL modules, `ApiSurfacesModule`, then `yarn nx run api:graphql-schema` to write `schema.gql`.
- [ ] **Step 4: Run** `yarn nx test api` -> PASS; lint and build `api` green. Production wiring untouched (`app.module.ts` still has no GraphQL import).
- [ ] **Step 5: Commit** `feat(api): GraphQL surfaces for notes, profile and storage`.

### Task 5: Client neutral refactor, `queries/profile.ts` (all three templates)

**Files:** Create `apps/templates/client-{shadcn,antd,mui}/src/queries/profile.ts`; modify each `src/routes/_dashboard/profile.tsx` (the inline `api(...)` calls at the lines found by `grep -n "api" <file>`); Test: `src/queries/__tests__/profile.unit.test.ts` per template, existing profile route tests unchanged.

**Interfaces:** Produces `useProfile(): UseQueryResult<Profile>` and the mutation hooks the page currently needs, same signatures in all three templates, using `api` from `../main`; `export interface Profile { uid: string; email: string; role: string }`.

- [ ] **Step 1: Read** each `profile.tsx` and list its `api` calls; write failing hook tests (mock `../main` `api`, assert the REST paths and request shapes it currently uses).
- [ ] **Step 2: Run** `yarn nx test client-shadcn -- profile` (and antd, mui) -> FAIL.
- [ ] **Step 3: Implement** the hooks (behaviour copied from the page) and make the three pages use them; identical hook file across templates.
- [ ] **Step 4: Run** `yarn nx run-many -t lint test build -p client-shadcn client-antd client-mui` -> PASS.
- [ ] **Step 5: Commit** `refactor(client): move profile requests into queries/profile.ts`.

### Task 6: Client GraphQL layer (the same files in all three templates)

**Files (per template `apps/templates/client-<ui>/`; copies must be byte-identical):**

- Create: `graphql-loader.d.ts`, `codegen.ts`, `src/api/graphql.ts`, `src/graphql/operation.ts`, `src/graphql/gql/notes.graphql`, `src/graphql/gql/profile.graphql`, `src/graphql/notes.queries.ts`, `src/graphql/profile.queries.ts`, `src/gql/types.ts` (generated, committed), `src/queries/notes.graphql.ts`, `src/queries/profile.graphql.ts`
- Modify: `vite.config.mts` (`graphqlLoader()` from `vite-plugin-graphql-loader` in `plugins`; this also covers vitest), `tsconfig.app.json`/`tsconfig.spec.json` (`include` the `.d.ts`), `package.json` (devDependencies), `project.json` (target `graphql-codegen`, `nx:run-commands`, `cwd` = the template, runs `graphql-codegen --config codegen.ts`), root `package.json` for the shared deps
- Create (repo level): `tools/create-icore/src/lib/__tests__/client-graphql-parity.unit.test.ts`
- Test: `src/api/__tests__/graphql.unit.test.ts`, `src/queries/__tests__/notes.graphql.unit.test.ts`, `profile.graphql.unit.test.ts` per template

**Interfaces:**

- Consumes: `api` from `../main` (Task 5 pattern), schema `apps/api/schema.gql` (Task 4).
- Produces: `request<TData, TVars extends Record<string, unknown>>(document: TypedDocumentNode<TData, TVars>, variables?: TVars): Promise<TData>` (prints the document with `graphql`'s `print`, `api<{ data?: TData; errors?: { message: string; extensions?: { code?: string } }[] }>('/graphql', { method: 'POST', body: JSON.stringify({ query, variables, operationName }) })`, throws `ApiError`-compatible error (status 200, body = errors) when `errors` is non-empty); `operation<TData, TVars>(document: DocumentNode, name: string): TypedDocumentNode<TData, TVars>` (extracts one operation by name plus the fragments it uses, throws listing the available names when missing; modelled on CBC's `getOperation`); `.graphql` operations `ListNotes`, `GetNote`, `CreateNote`, `UpdateNote`, `DeleteNote`, `GetMe`; codegen writes `src/gql/types.ts` with `ListNotesQuery`, `ListNotesQueryVariables`, ...; `queries/notes.graphql.ts` exports the same names as `queries/notes.ts` (`useNotesList(limit, offset)`, `useCreateNote()`, `useUpdateNote()`, `useDeleteNote()`, `Note`) and `queries/profile.graphql.ts` the same as `queries/profile.ts` (Task 5), invalidating the same query keys.

- [ ] **Step 1: Add deps** (root + manifest-compatible versions from Tech Stack), `yarn install`, sync shell.
- [ ] **Step 2: Write failing tests** (shadcn first, then copy): `request` unwraps `data`; with `errors` it throws; sends `operationName`; `operation` extracts `ListNotes` and throws a message containing the available names for an unknown name; `notes.graphql` hooks call `/graphql` with the `ListNotes` document and variables `{ limit, offset }`, `useCreateNote` invalidates `['notes']` on success (Review Focus 7); parity test: the new files are byte-identical across the three templates (and `queries/notes.ts` still is).
- [ ] **Step 3: Run** `yarn nx test client-shadcn -- graphql` -> FAIL.
- [ ] **Step 4: Implement**, run `yarn nx run client-shadcn:graphql-codegen` (validates the operations against `schema.gql`, writes `src/gql/types.ts`), then copy the identical file set to antd and mui and run codegen there.
- [ ] **Step 5: Run** `yarn nx run-many -t lint test build -p client-shadcn client-antd client-mui` and the parity test -> PASS. Confirm the production client still imports `queries/notes` (REST) only.
- [ ] **Step 6: Commit** `feat(client): GraphQL data layer on TanStack Query with .graphql files`.

### Task 7: The `api` axis in `create-icore`

**Files:**

- Modify: `tools/create-icore/src/lib/options.ts` (`ApiStyle`, `CreateIcoreOptions.api`, `validateOptions`), `lib/config.ts` (`API_STYLES`, key `api`), `lib/prompts.ts` (flag `--api`, wizard question after the example question, default `rest`), `lib/scaffold.ts` (new steps), `manifest/types.ts` (`Manifest.api: Record<ApiStyle, Unit>`), `manifest/index.ts` (`api` units), `manifest/resolve.ts` (`resolveUnits` + exclusion lists), `manifest/wire-features.ts` (skip REST notes module for `graphql`), `manifest/blueprint.ts` (`api` recorded), `src/migrate/plan.ts` (unit matching `api:<style>`), `tools/create-icore/scripts/smoke-scaffold.mjs` (`--api` passthrough)
- Create: `tools/create-icore/src/manifest/wire-api.ts`
- Test: extend `validate-options`, `config`, `prompts`, `resolve`, `blueprint`, `wire-features` tests; create `manifest/__tests__/wire-api.unit.test.ts`, `lib/__tests__/scaffold-api.unit.test.ts` (real templates, like `scaffold-ui-none.unit.test.ts`)

**Interfaces:**

- Produces: `type ApiStyle = 'rest' | 'graphql' | 'both'`; `MANIFEST.api.rest = EMPTY`; `MANIFEST.api.graphql` / `.both` units with server `deps` (`@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql`), and an extra unit `MANIFEST.apiClient` (client deps: `@graphql-typed-document-node/core`, `vite-plugin-graphql-loader`, `@graphql-codegen/cli`, `@graphql-codegen/typescript`, `@graphql-codegen/typescript-operations`) active only when `api === 'graphql' && ui !== 'none'` (add to `resolveUnits`); `wireApi(targetDir: string, opts: CreateIcoreOptions): Promise<void>` doing, for `api !== 'rest'`: write `ApiSurfacesModule` into `app.module.ts` imports (regex edit like `removeUploadStack`), and for `graphql` also remove the `ProfileModule` import, **swap** `storage.controllers.graphql.ts` over `storage.controllers.ts`; `applyApiVariants(targetDir, opts)` renaming `*.graphql.ts` swap files over their REST twins for `api === 'graphql'` (`queries/notes`, `queries/profile`) and deleting the `*.graphql.ts` files otherwise; exclusion lists in `resolve.ts`: `API_REST_EXCLUDED_PATHS` (everything GraphQL: `apps/api/src/app/graphql`, `apps/api/src/app/{notes,profile,storage}/graphql`, `apps/api/schema.gql`, `apps/api/scripts/emit-schema.ts`, `apps/api/src/app/storage/storage.controllers.graphql.ts`, client `graphql-loader.d.ts`, `codegen.ts`, `src/api/graphql.ts`, `src/graphql`, `src/gql`, `src/queries/*.graphql.ts`, via `addExcludedPath` for the three templates) for `rest`; `API_BOTH_EXCLUDED_PATHS` (the client GraphQL files only) for `both`; `API_GRAPHQL_EXCLUDED_PATHS` (`notes.controller.ts`, `notes.module.ts`, the notes controller test, `profile.controller.ts`, `profile.module.ts`) for `graphql`.
- `validateOptions`: `api !== 'rest'` + `authProvider === 'none'` -> error `--api=<x> needs auth (resolvers are guarded by the session)`; `api !== 'rest'` + `host === 'cloudflare'` -> error mentioning `--api` and `docs/runbooks/cloudflare-workers-host.md`.

- [ ] **Step 1: Write failing tests.** `validate-options`: the two errors, `rest` and `both` with supabase auth accepted; `config`: `api` accepts the three values, rejects `soap`; `prompts`: `--api=graphql` parsed, wizard offers the three choices with `rest` first; `resolve`: for each of the three values the exclusion sets and active units (rest: no GraphQL dep; graphql + `ui=none`: no `apiClient` unit); `wire-api`: against a fixture `app.module.ts`; **real-template scaffold tests** (`scaffold-api.unit.test.ts`): `rest` has **none** of the GraphQL paths/deps and its file list equals today's plus exactly the neutral files (golden list file under `__tests__/fixtures/`), `graphql` (supabase auth, notes, upload) has `schema.gql`, resolvers, **no** `notes.controller.ts`/`profile.controller.ts`, storage controllers registry containing only the files controller, `queries/notes.ts` content from the GraphQL swap, `audit` clean (`auditProject`); `both` keeps controllers and has resolvers but REST client queries; `--api=graphql --example=none --upload=none` scaffolds with only `me` resolvers; blueprint records `api`; migrate: a project whose `blueprint.json` has `api` still resolves a plan.
- [ ] **Step 2: Run** `cd tools/create-icore && npx vitest run src/lib src/manifest src/migrate` -> the new tests FAIL.
- [ ] **Step 3: Implement** options/config/prompts/validation, then manifest units and exclusions, then `wire-api.ts` and the two scaffold steps (call `wireApi` after `writeFeaturesWiring`, `applyApiVariants` after `selectClientTemplate`), then blueprint and migrate.
- [ ] **Step 4: Run** `yarn nx run-many -t lint test build -p create-icore` -> PASS; `template-shell-drift` and `workspace-ownership` green (manifest dep versions equal root's).
- [ ] **Step 5: Smoke (link mode)** `node tools/create-icore/scripts/smoke-scaffold.mjs --api=graphql --auth=supabase --db=supabase --upload=supabase --example=notes --ui=shadcn --services=api,auth,upload,notes` and the same for `--api=both` and `--api=graphql --example=none --upload=none` -> `smoke OK`.
- [ ] **Step 6: Commit** `feat(create-icore): add the --api=rest|graphql|both axis`.

### Task 8: CI, smoke combos, docs, changeset

**Files:** Modify `.github/workflows/pipeline.yml` (combos `api-graphql-shadcn`, `api-graphql-antd`, `api-graphql-mui`, `api-both`, `api-graphql-minimal` in shard 2; new steps in the `check` job: `yarn nx run api:graphql-schema && git diff --exit-code apps/api/schema.gql` and `yarn nx run client-shadcn:graphql-codegen && git diff --exit-code apps/templates/client-shadcn/src/gql`), `.github/workflows/scaffold-smoke-matrix.yml` (legs `supabase-graphql-tcp-antd`, `supabase-both-tcp-shadcn`), `AGENTS.md` (axis, always-REST list, `/api/graphql`, guard rule, schema/codegen checks), `docs/runbooks/create-icore-blueprint-options.md` (option row, validation rules, exclusion summary), `tools/create-icore/README.md` (`--api` row); Create `docs/runbooks/graphql-api.md` (how it works, security requirements, how to add a resolver, error mapping), `.changeset/api-graphql-axis.md` (minor).

- [ ] **Step 1: Edit** the files above; `npx prettier --write` all touched files.
- [ ] **Step 2: Verify** locally: `yarn nx run-many -t lint test build` (all projects) and both drift commands exit 0.
- [ ] **Step 3: Commit** `docs(ci): wire the api axis into smoke combos, drift checks and runbooks`.

### Task 9: Live verification, review and PR

- [ ] **Step 1: Generated `--api=graphql` projects boot.** For `--ui=shadcn`, `--ui=antd`, `--ui=mui` (install mode, `--session=memory`, fake auth strategy): `node tools/create-icore/scripts/smoke-scaffold.mjs --api=graphql --ui=<ui> --session=memory --mode=install --run --run-seconds=90 --services=api,auth,upload,notes` -> `smoke OK` x3; also `--api=both` once.
- [ ] **Step 2: Real round trip.** Start gateway + auth + notes of one generated project (`--ui=none`, fake auth), `curl` the REST login (cookie jar + CSRF token), then `POST /api/graphql` with `{ me }`, `createNote`, `notes`; confirm `HTTP 401` after deleting the cookie and `403` without the CSRF header; confirm `{ __schema }` is rejected with `NODE_ENV=production`.
- [ ] **Step 3: Browser check.** Serve a generated `--api=graphql --ui=antd` client against that gateway (playwright or chrome-devtools MCP), log in, create/list/delete a note, expire the session once and confirm the redirect/refresh behaviour matches the REST client.
- [ ] **Step 4: Whole-branch review** (fresh reviewer on the most capable model, with the Review Focus list), fix Critical/Important findings test-first.
- [ ] **Step 5: Push and open the PR** (`gh pr list --state all --limit 10` first; `gh pr create --base dev`), body with the test plan above; wait for CI and the manual `Scaffold Smoke Matrix` run on the branch; report, do not merge.
