# GraphQL API (`--api=graphql|both`)

`create-icore --api` picks the gateway's API style: `rest` (default), `graphql` or `both`. This page explains how the GraphQL side
works, what it guarantees, and how to extend it. Design: `docs/superpowers/specs/2026-11-14-api-graphql-axis-design.md`.

## What each mode generates

| `api`     | Gateway                                                                                             | Client                                                                          |
| --------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `rest`    | REST only. No GraphQL file, dependency or nx target (output = the pre-axis output).                 | REST hooks.                                                                     |
| `graphql` | `POST /api/graphql` replaces the REST surface of notes, profile and storage list/signed-url/remove. | `queries/notes.ts` / `queries/profile.ts` call `/api/graphql`; pages unchanged. |
| `both`    | REST and `/api/graphql` side by side.                                                               | REST hooks (`/api/graphql` is for other consumers).                             |

**Always REST**, in every mode: auth (login, register, refresh, logout, password reset, OAuth redirects: cookies and redirects are HTTP
concerns), webhooks, admin (bull-board), storage upload and download (multipart / binary streams), Swagger (documents the REST surface that
remains).

**Per feature.** A GraphQL surface exists only when its feature does: notes (`notes`, `note`, `createNote`, `updateNote`, `deleteNote`) needs
`--example=notes`; profile (`me`, `updateProfile`) needs auth; storage (`files`, `signedUrl`, `removeFile`) needs `--upload` ≠ `none` and auth. The public
`health` query (`Query { health: Health! }`) is always there, so the schema is never empty. With `--auth=none` the endpoint serves `health`
only: it is the foundation you add your own resolvers to.

`--host=cloudflare` supports `rest` only (Apollo on workerd is not verified).

## How it works

- `apps/api/src/app/graphql/graphql.module.ts` (`ApiGraphqlModule`): Apollo driver, code-first, path `graphql` under the global `api`
  prefix (`/api/graphql`), context `{ req, res }`, the limits and error handling below, the public `HealthResolver`, and a request-level
  throttle middleware.
- `apps/api/src/app/graphql/api-surfaces.module.ts` (`ApiSurfacesModule`): `ApiGraphqlModule` plus each feature's
  `<feature>/graphql/<feature>-graphql.module.ts`. **Generated** by `create-icore` (`manifest/wire-api.ts`) for the selected features and
  imported into `app.module.ts`; the repo keeps the full version.
- `apps/api/src/app/graphql/api-surface-resolvers.ts` (`API_SURFACE_RESOLVERS`): the resolvers printed into the schema. Generated the same way.
- `NotesClientModule.forRoot()` and `UploadClientModule.forRoot()` return one memoized `DynamicModule`, so `both` (REST module + GraphQL module
  importing the same client) opens one TCP client per microservice, not two (`notes/__tests__/client-module-sharing.unit.test.ts`).
- Business rules are not duplicated: resolvers and controllers call the same gateway services (`NotesGatewayService`, `assertOwnership`).
- Guards are context-neutral (`requestOf` in `http/execution-context.ts`): the global `AuthGuard`, `CsrfGuard`, `AbilityGuard` and the
  throttler guard work on resolvers unchanged; `@Public()`, `@SkipCsrf()`, `@CheckAbility()` and `@CurrentUser()` apply to resolvers.
- Client (`api=graphql`): operations in `src/graphql/gql/*.graphql` (loaded by `vite-plugin-graphql-loader`), picked by name with
  `operation()` in `src/graphql/<domain>.queries.ts`, sent by `request()` in `src/api/graphql.ts` through `@idevconn/api-client` (token
  refresh, CSRF header, typed `ApiError`), typed by `src/gql/types.ts` from `graphql-codegen`.

## Security requirements (acceptance, enforced by tests)

- Introspection and GraphiQL are **off when `NODE_ENV=production`**. Docker images and every deployed gateway must run with
  `NODE_ENV=production`; otherwise introspection and GraphiQL are on, unmasked error messages reach clients, and the gateway tries to
  write `apps/api/schema.gql`.
- Production: no "Did you mean …?" field suggestions in validation errors (`hideSchemaDetailsFromClientErrors`).
- Production error masking: unexpected errors become `Internal server error` with `INTERNAL_SERVER_ERROR`; 5xx `HttpException`s keep
  their code but not their message; no stack traces.
- Limits: query depth 8, 15 aliases per operation (fragments are expanded before counting; a fragment chain too deep to measure is
  refused with 400), batched HTTP requests rejected, Apollo `csrfPrevention` on.
- Every resolver runs behind the global `AuthGuard` unless it is `@Public()` (only `health`). The client sends every operation as
  `POST /api/graphql`, and `CsrfGuard` requires `X-CSRF-Token` on every POST, queries included (`health` is `@SkipCsrf()`). A query
  sent as `GET` runs only with Apollo's preflight header (`apollo-require-preflight` or a non-simple content type, `csrfPrevention`)
  and a valid session; `CsrfGuard` does not check GET (a safe method). Mutations over `GET` are always rejected (405).
- `@CheckAbility` parity with the controllers (admin sees all notes, a user only their own).
- Throttling: the `default` 120 requests/minute floor applies to `/api/graphql` at request level (middleware, before Apollo parses
  anything) and per resolver (guard). The per-resolver guard counts each root field of an operation separately, so one request
  with several root fields uses several units of the floor. A costly new operation declares its own named `@Throttle` (see
  AGENTS.md, named throttlers).
- `auth=none`: no `AuthGuard` and no `CsrfGuard` exist (they live in the auth module); `health` is public anyway. The auth module is also
  where the global throttler guard is registered, so the `auth=none` gateway `app.module.ts` (every `--api` mode) registers
  `ThrottlerModule.forRoot(throttlerOptions)` **and** `{ provide: APP_GUARD, useClass: ContextAwareThrottlerGuard }` itself: the
  `default` floor (120/min) applies to REST routes and resolvers, and the request-level GraphQL throttle has its `default` throttler.
  (Until this was fixed, a `rest` + `auth=none` gateway had `ThrottlerModule` with only `auth-burst` and no `APP_GUARD`, i.e. no
  effective rate limit.)

## Profile (display name)

`PATCH /api/profile {name}` and the GraphQL mutation `updateProfile(name:)` set the display name; `GET /api/profile` and `me { name }`
read it. Both go through `ProfileGatewayService` (`apps/api/src/app/profile/`): the uid is the session's, never the request's, and the
name is validated by `parseProfileName` (trimmed, 1-100 characters, no control characters; else 400 `invalid_name`).

The name lives at the identity provider, behind `AuthStrategy.getProfile(uid)` / `updateProfile(uid, { name })` (auth MS patterns
`auth.profile.get` / `auth.profile.update`): Supabase `user_metadata.name` (merged into the existing metadata, which GoTrue otherwise
replaces whole), Firebase `displayName`, MongoDB a `name` field, Postgres a `name` column (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
on first use, so existing deployments need no manual migration). The session record does not carry it: the name is read on demand
(`me { uid }` alone makes no call to the auth microservice, only a selected `name` does), so a rename shows up in every session at once.

## Error mapping

A guard or resolver `HttpException` becomes a `GraphQLError` with `extensions.code` and `extensions.http.status`; the HTTP response carries
that status (`preserveHttpStatusForExecutionErrors: false`), so the client's refresh-on-401 works over GraphQL:

| HTTP status | `extensions.code`       |
| ----------- | ----------------------- |
| 401         | `UNAUTHENTICATED`       |
| 403         | `FORBIDDEN`             |
| 404         | `NOT_FOUND`             |
| 409         | `CONFLICT`              |
| 429         | `TOO_MANY_REQUESTS`     |
| 503         | `SERVICE_UNAVAILABLE`   |
| other ≥ 500 | `INTERNAL_SERVER_ERROR` |
| other 4xx   | `BAD_USER_INPUT`        |

An error that is not an `HttpException` (a bug, a failed dependency) is logged and answered as HTTP 500 `INTERNAL_SERVER_ERROR` instead of Apollo's default 200 with `errors[]`; in production its message is masked.

The client's `request()` turns `errors[]` into `ApiError`.

## Schema and codegen

- `nx run api:graphql-schema` prints the schema from `API_SURFACE_RESOLVERS` without booting the gateway (`apps/api/scripts/emit-schema.ts`,
  run under `@swc-node/register` because `@Args` needs decorator metadata). A gateway started outside production also writes it.
- `nx run <client>:graphql-codegen` validates every `.graphql` operation against the schema and writes `src/gql/types.ts`. It
  **depends on `api:graphql-schema`**: generated projects do not ship `apps/api/schema.gql` (the repo's copy is the full-feature schema),
  so the first codegen run emits it. The shipped `src/gql/types.ts` is the full-feature superset until then. `ignoreNoDocuments` lets
  codegen succeed in a project without operations (`auth=none`).
- CI (`pipeline.yml`, `check` job): `GraphQL schema drift` (`api:graphql-schema` + `git diff --exit-code apps/api/schema.gql`) and
  `GraphQL codegen drift` (`client-shadcn:graphql-codegen` + `git diff --exit-code apps/templates/client-shadcn/src/gql`). Scaffold smoke
  combos `api-graphql-{shadcn,antd,mui}`, `api-both`, `api-graphql-minimal`, `api-graphql-ui-none`, `api-graphql-auth-none` (typecheck) and
  the nightly legs `supabase-graphql-tcp-antd`, `supabase-both-tcp-shadcn`, `api-only-graphql-auth-none-tcp` (install, build, boot).
  For `--api=graphql|both` the boot phase of `smoke-scaffold.mjs` also POSTs `{ health { status } }` to the booted gateway's
  `/api/graphql` and, with auth, checks that an anonymous `{ me { uid } }` answers HTTP 401 (guards apply to GraphQL); a gateway that
  never answers within `--run-seconds` fails the leg.
- Generated projects: the shipped `ci.yml` runs `graphql-codegen` for every project that has the target (none in a `rest` project), so a
  `.graphql` operation that no longer matches the gateway schema fails their CI. It does not diff `src/gql/types.ts` (the shipped copy is
  the full-feature superset, so the first run would always differ): commit the regenerated file after changing an operation or resolver.

## Adding a resolver

1. Put object/input types and the resolver under `apps/api/src/app/<feature>/graphql/`. Give every `@Field`, `@Query`, `@Mutation` and
   `@Args` an explicit type (`() => String`): the schema script runs without type inference.
2. Call the same gateway service the controller uses; never copy ownership or ability rules into the resolver. Use `@CurrentUser()` and
   `@CheckAbility(action, subject)` as on controllers. A public operation needs `@Public()` (and `@SkipCsrf()` only if it is truly
   CSRF-exempt).
3. Register it in `<feature>-graphql.module.ts`, add the module to `api-surfaces.module.ts` and the resolver to
   `api-surface-resolvers.ts` (in the repo: also teach `manifest/wire-api.ts` the new surface so generated projects get it).
4. Run `yarn nx run api:graphql-schema` and commit `apps/api/schema.gql`; add operations in the client's `src/graphql/gql/*.graphql`,
   run `graphql-codegen`, commit `src/gql/types.ts`.
5. Tests: a resolver unit test with a fake service, and a case in `graphql/__tests__/graphql.integration.unit.test.ts` if it needs the
   real guards.

## Removing the notes example

`node tools/remove-notes.mjs` (or `yarn remove-notes`) also removes `notes/graphql`, `NotesGraphqlModule` and `NotesResolver` from the
generated files and the client's GraphQL notes operations.
