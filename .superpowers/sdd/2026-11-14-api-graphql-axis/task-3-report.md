# Task 3 report: GraphQL foundation

Status: DONE_WITH_CONCERNS
Commit: `e6b4b5a feat(api): GraphQL foundation (Apollo module, limits, HTTP status mapping)` on `feature/api-graphql` (not pushed).

## What was built

- `apps/api/src/app/graphql/graphql.module.ts`: `ApiGraphqlModule`. It uses `GraphQLModule.forRootAsync<ApolloDriverConfig>({ driver: ApolloDriver, useFactory: () => graphqlOptions() })`, and `graphqlOptions(env)` returns the brief's values:
  - `sortSchema: true`, `useGlobalPrefix: true`, `path: 'graphql'`, context `({ req, res }) => ({ req, res })`
  - `introspection` and `graphiql` set to `!production`
  - `allowBatchedHttpRequests: false`, `csrfPrevention: true`
  - `validationRules: createLimitRules({ maxDepth: 8, maxAliases: 15 })`
  - `formatError` with production masking (see below)
  - `buildSchemaOptions.addNewlineAtEnd`
  - `preserveHttpStatusForExecutionErrors: false`

  `GraphqlErrorFilter` is registered as `APP_FILTER`. Also exported: `formatGraphqlError` and `SCHEMA_FILE`.
- `graphql-limits.ts`: `createLimitRules({ maxDepth, maxAliases })` returns two custom `ValidationRule`s and adds no dependency.
  - Depth is counted per operation. It follows fragments, guards against fragment cycles and skips `__*` introspection fields; `{ a }` has depth 1.
  - Aliases are counted across the whole document, fragments included.
- `graphql-error.filter.ts`: `@Catch(HttpException) GraphqlErrorFilter extends BaseExceptionFilter`.
  - In a `graphql` context it throws `new GraphQLError(message, { extensions: { code, http: { status } } })`. The codes are 401 UNAUTHENTICATED, 403 FORBIDDEN, 404 NOT_FOUND, and BAD_USER_INPUT with the exception's own status for anything else.
  - Any other context goes to `super.catch` (Nest's default), so REST responses are unchanged. A test pins this.
- `schema-emitter.ts`: `emitSchema(resolvers: Function[]): Promise<string>`. It uses `GraphQLSchemaBuilderModule` + `GraphQLSchemaFactory.create`, then sorts and prints the schema with Nest's own `GRAPHQL_SDL_FILE_HEADER`/`_END`. I checked by hand that a development boot of `ApiGraphqlModule` writes a byte-identical file, so the dev server and the nx target cannot fight over `schema.gql`.
- `apps/api/scripts/emit-schema.ts` + nx target `api:graphql-schema`: `nx:run-commands`, `tsx --tsconfig apps/api/tsconfig.app.json apps/api/scripts/emit-schema.ts`, output `{projectRoot}/schema.gql`. This follows the repo pattern `tsx tools/create-icore/scripts/...`.
  - For now the script passes a `PlaceholderResolver` (`placeholder: Boolean!`), since a schema needs a Query type. Task 4 replaces it with the real resolvers.
  - I ran the target end to end and it wrote a valid SDL. I then deleted the generated `schema.gql`, because Task 4 owns the committed file.
- Tests:
  - `graphql/__tests__/graphql.integration.unit.test.ts` (16 tests)
  - `graphql-limits.unit.test.ts` (8)
  - `schema-emitter.unit.test.ts` (2)
  - `http/__tests__/current-user.decorator.unit.test.ts` (3, covers Task 1's decorator for http and graphql contexts and the no-user case)
- Dependencies: root and `apps/api` `package.json` gained `@nestjs/graphql ^14.2.1`, `@nestjs/apollo ^14.2.1`, `@apollo/server ^5.5.2`, `graphql ^16.11.0` (resolved 16.15.0) and `@as-integrations/express5 ^1.1.2` (see deviation 1).
  - I ran `yarn install`; `yarn install --immutable` passes.
  - `sync-template-shell.mjs` synced 0 versions, because none of these names is in the shell yet. The manifest has no GraphQL pins yet either; those come in Task 7.
- `ApiGraphqlModule` is NOT imported by `app.module.ts`, `features.module.ts` or `main.ts`. I grepped them, and the built `dist/apps/api/main.js` contains no GraphQL module code. The only `graphql` hits are Task 1's comment in `execution-context` and the root package.json, which was already embedded.

## HTTP status mechanism (riskiest item)

**Mechanism:** `GraphqlErrorFilter` (APP_FILTER) rethrows a `GraphQLError` with `extensions.http.status`, AND `preserveHttpStatusForExecutionErrors: false` is set. Apollo Server 5 then uses `extensions.http.status` as the response status and strips `http` from the body. The test asserts that `extensions.http` is undefined in the response.

Why both pieces are needed, from reading `node_modules/@nestjs/apollo/dist/drivers/apollo-base.driver.js` and confirmed by mutation runs:

- Guard exceptions are thrown inside field execution, so the response is `{ data: null, errors }`. `@nestjs/apollo` 14 adds `createPreserveHttpStatusPlugin` unless `preserveHttpStatusForExecutionErrors === false`. Despite its name, that plugin **resets every response with a `data` key to HTTP 200**. With that option removed, 5 tests fail (401/403/404 become 200).
- Without the filter, Nest's own `createTransformHttpErrorFn` in `formatError` sets only `extensions.code` and never `http.status`, so the status stays 200. With the filter removed, the same 5 tests fail.
- `formatError` alone cannot do it: it runs after the status is decided. An Apollo plugin could do it, but the filter keeps the mapping in one place and also covers resolver-thrown exceptions (403/404), not just guards.

I ran both mutations and then restored the file.

## RED evidence

`npx vitest run --root apps/api graphql current-user schema-emitter`, before any implementation:

```
FAIL src/app/graphql/__tests__/graphql-limits.unit.test.ts       Error: Cannot find module '../graphql-limits'
FAIL src/app/graphql/__tests__/graphql.integration.unit.test.ts  Error: Cannot find module '../graphql.module'
FAIL src/app/graphql/__tests__/schema-emitter.unit.test.ts       Error: Cannot find module '../schema-emitter'
Test Files  3 failed | 1 passed (4)
```

The one passing file is the `CurrentUser` test, which covers code that already existed from Task 1.

First run after implementing: 24 passed, 5 failed.
- The two `emitSchema` tests failed on a dual `graphql` copy (fixed, see deviation 3).
- Depth tests failed because my test helper `nested(n)` produced depth n+1. I fixed the helper in both test files. This was a test bug, not an implementation bug.

## GREEN evidence

- `npx vitest run --root apps/api graphql current-user schema-emitter`: 4 files, 29 tests passed.
- `yarn nx run-many -t lint test build -p api`: lint OK; api tests **21 files, 173 tests passed**; `webpack compiled successfully`.
- `yarn nx test create-icore`: **46 files, 451 tests passed** (after deviation 5). `yarn nx lint create-icore` OK.
- `yarn nx run api:graphql-schema`: writes `apps/api/schema.gql` (placeholder SDL).
- `yarn install --immutable`: OK. The pre-commit hook (lint-staged + nx affected lint/test) passed.

What the integration test pins, against a real Nest app with the real `AuthGuard`, `CsrfGuard` and `ContextAwareThrottlerGuard` as APP_GUARDs, the in-memory session store, a stub `AuthClientService`, `cookie-parser` and `setGlobalPrefix('api')`:

| Case | Expected result |
| --- | --- |
| No session cookie | 401 `UNAUTHENTICATED`, resolver not called |
| Session but no `X-CSRF-Token` | 403 `FORBIDDEN` `csrf_mismatch` |
| Session and token | 200 with `data.ping` |
| Resolver throws Forbidden / NotFound | 403 `FORBIDDEN` / 404 `NOT_FOUND` |
| `GET ?query=mutation{touch}`, even with session, CSRF token and preflight header | 4xx, not executed |
| GET query without a preflight header | 400 (Apollo CSRF prevention) |
| Batched array body | 400, resolver not called |
| Depth 8 | accepted |
| Depth 9 | 400 `GRAPHQL_VALIDATION_FAILED`, resolver not called |
| 16 aliases | 400 `GRAPHQL_VALIDATION_FAILED`, resolver not called |
| REST `ForbiddenException` | still the normal `{statusCode:403,message}` JSON |
| `NODE_ENV=production`: introspection | rejected (400) |
| `NODE_ENV=production`: `Error('boom')` | `INTERNAL_SERVER_ERROR`, no stacktrace, message does not contain "boom" |
| `NODE_ENV=production`: no session | still 401 |
| `NODE_ENV=production`: GET with `accept: text/html` | no GraphiQL page |

## Deviations from the brief (each needed; please confirm)

1. **Extra dependency `@as-integrations/express5 ^1.1.2`** in root and `apps/api`. `@nestjs/apollo` 14 loads it at runtime for the Express platform (`loadPackage('@as-integrations/express5', ...)` in `registerExpress`); without it the module cannot start. It is an optional peer, so `@nx/dependency-checks` flagged it as unused, and I added it to `ignoredDependencies` in `apps/api/eslint.config.mjs` with a comment. Task 7's api unit must ship it together with the other four.
2. **`forRootAsync` + `useFactory` instead of `forRoot`.** This way `NODE_ENV` is read when the module is compiled, not when the file is imported. The production test depends on that, and so would any code that sets the env before bootstrap. The option values themselves match the brief.
3. **The schema file is written only when NODE_ENV is neither `production` nor `test`.** The brief says "non-production". Under `yarn nx test api` (cwd `apps/api`, root `.env` loaded), the first version wrote the throwaway test schema to `apps/api/apps/api/schema.gql`. I removed that file.
   - With the brief's rule, every test run would overwrite or pollute the committed schema.
   - The integration test now pins NODE_ENV (`test`/`production`) while it builds the app.
   - Note: `join(process.cwd(), 'apps/api/schema.gql')` assumes the server runs from the workspace root, as `nx serve` does.
4. **vitest alias for `graphql`.** `apps/api/vitest.config.mts` maps bare `graphql` to `require.resolve('graphql')` (index.js). Vite picks `index.mjs` while the externalized ESM `@nestjs/graphql`/`@apollo/server` get Node's `index.js`. Two realms break `lexicographicSortSchema` ("Cannot use GraphQLScalarType from another module or realm"). The webpack build marks every package as `commonjs` external, so runtime is not affected.
5. **`tools/create-icore/src/lib/scaffold-auth-none.ts`.** I added `apps/api/src/app/graphql` and `apps/api/scripts/emit-schema.ts` to `AUTH_ONLY_PATHS`.
   - Without this, `scaffold-ui-none.unit.test.ts`'s dangling-import audit failed: the integration test imports `@icore/auth-client`, which is absent in `auth=none` scaffolds.
   - Spec §9 makes GraphQL require auth anyway. Task 7's `--api` axis should take over the general exclusion and can keep or replace these lines.
6. **`tsconfig.app.json` include gained `scripts/**/*.ts`.** tsx applies a tsconfig only to files the tsconfig includes. Before this change the script was compiled with TC39 decorators (`__runInitializers`), the decorators registered nothing, and the run failed with "Query root type must be provided". It also means the build now type-checks the script.
7. **The integration test uses `fetch` against `app.listen(0)`, not supertest.** supertest is not installed, and the existing `throttler.config.unit.test.ts` uses this same pattern, so no new dependency.
8. **I discarded the regenerated `tools/create-icore/templates/apps/api/project.json`** (build artifact drift, per the repo memory). The snapshot will pick up the new target on the next official snapshot.

## Self-review findings

- **tsx and decorator metadata.** The emitter script runs under tsx, which uses esbuild and emits no decorator metadata. Every `@Field`, `@Query`, `@Mutation` and `@Args` in Task 4 must give its type explicitly (`() => String`), or `api:graphql-schema` fails or drifts from the runtime schema. This is documented in the script header. Vitest (oxc) does emit metadata, so a Task 4 resolver missing explicit types would pass its tests and fail only in the nx target.
- **Introspection is not counted toward the depth limit.** This is intentional: otherwise GraphiQL's introspection query breaks in development. Introspection is off in production.
- **Production masking.** It keeps the message of deliberate `GraphQLError`s (mapped HttpExceptions and validation errors) and replaces anything else with "Internal server error". Nest also logs `ExceptionsHandler Error: boom` for the test's thrown error; that is expected.
- **Status code mapping.** HttpExceptions other than 401/403/404 map to `BAD_USER_INPUT` with their own status, as the brief says. A 5xx `HttpException` (for example `ServiceUnavailableException('session_store_unavailable')` from `AuthGuard`) is therefore labelled `BAD_USER_INPUT` with status 503. The status is right but the code is odd; consider `INTERNAL_SERVER_ERROR` for `>= 500`.
- **`GraphqlErrorFilter` is a global `APP_FILTER` for `HttpException`.** In `both` mode it also sees REST exceptions, but passes them to `BaseExceptionFilter`, and a test pins the REST shape. It would replace any other global HttpException filter's role for REST; there is none in the gateway today.

## Concerns

- **Until Task 7 lands, `rest` scaffolds (auth on) ship `apps/api/src/app/graphql/**`, `scripts/emit-schema.ts`, the `graphql-schema` target and the 5 GraphQL dependencies.** This comes from the plan order. The `auth=none` case is handled by deviation 5.
- **`dist/apps/api/package.json` (generatePackageJson) now lists the GraphQL dependencies.** The repo's production Docker install therefore pulls them, even though the REST-only wiring never loads them. This is a consequence of declaring them in `apps/api/package.json` as the brief requires.

## Files changed

- `package.json`, `yarn.lock`
- `apps/api/package.json`, `apps/api/project.json`, `apps/api/tsconfig.app.json`, `apps/api/vitest.config.mts`, `apps/api/eslint.config.mjs`
- `apps/api/scripts/emit-schema.ts`
- `apps/api/src/app/graphql/{graphql.module.ts,graphql-limits.ts,graphql-error.filter.ts,schema-emitter.ts}`
- `apps/api/src/app/graphql/__tests__/{graphql.integration,graphql-limits,schema-emitter}.unit.test.ts`
- `apps/api/src/app/http/__tests__/current-user.decorator.unit.test.ts`
- `tools/create-icore/src/lib/scaffold-auth-none.ts`

---

## Fix round 1

Commit: `c7b160d fix(api): harden GraphQL limits, error codes and request throttling` on `feature/api-graphql` (not pushed). Findings 1-4 are fixed test-first. Minor findings were not touched, as instructed.

### Finding 1 (CRITICAL): depth rule took exponential time on fragment chains

**Fix.** `graphql-limits.ts` is rewritten as a single rule. A `CostWalker` measures depth and alias count for each fragment once, keeps the result in a `Map<string, Cost>`, and keeps a `visiting` set as a cycle guard. A spread reuses the stored result, so validation time grows linearly with document size. `createLimitRules` still returns `ValidationRule[]`, now with one entry. The error messages are unchanged.

**RED.** With the old rule, timed on a doubling chain using a temporary tsx script against `createLimitRules`:

| Fragments | Old rule |
| --- | --- |
| 16 | 16 ms |
| 20 | 156 ms |
| 22 | 612 ms |

I did not run the new 30-fragment tests against the old code, because they would block the event loop for minutes.

**GREEN.** The same script on the new rule takes 1 ms, 0 ms and 0 ms. New tests:
- 30-fragment doubling chain: no errors, under 100 ms.
- 30-fragment tripling chain: no errors, under 100 ms.
- A doubling chain that nests `child` reports exactly `Query depth 32 exceeds the maximum of 8.` in under 100 ms.
- 40-fragment tripling alias chain: rejected, under 100 ms.

### Finding 2 (IMPORTANT): aliases inside fragments were counted only once

**Fix.** The same walk now counts aliases per operation after fragment expansion. Each fragment's alias count is stored once and added again for every place the fragment is spread.

**RED.** Two tests failed:
- The reviewer's amplification document (6 doubling fragments with one alias each, plus a leaf with 9 aliases) returned `[]`. It should report `639 aliases exceed the maximum of 15.`
- `query A {8 aliases} query B {8 aliases}` returned `16 aliases exceed…`, because the old rule counted per document, not per operation.

**GREEN.** Both pass. The existing alias tests still pass, including "16 aliases flagged" and "aliases inside fragments".

### Finding 3 (IMPORTANT): error codes ignored the HTTP status (ruling R5)

**Fix in `graphql-error.filter.ts`.** `graphqlCodeFor(status)` now maps by status:

| Status | Code |
| --- | --- |
| 401 | UNAUTHENTICATED |
| 403 | FORBIDDEN |
| 404 | NOT_FOUND |
| 409 | CONFLICT |
| 429 | TOO_MANY_REQUESTS |
| 503 | SERVICE_UNAVAILABLE |
| other 5xx | INTERNAL_SERVER_ERROR |
| other 4xx (incl. 400/422) | BAD_USER_INPUT |

The HTTP status is kept in every case.

**Fix in `graphql.module.ts`.** In production, `formatGraphqlError` reads `extensions.http.status` from the original `GraphQLError`. When the status is 500 or above, it replaces the message with `Internal server error` and keeps the code.

**RED.** The conflict, throttled, unavailable and internal cases, plus both production masking tests, received `BAD_USER_INPUT`.

**GREEN.** These integration tests now pass:
- `it.each`: 400 BAD_USER_INPUT, 409 CONFLICT, 429 TOO_MANY_REQUESTS (a `ThrottlerException`), 503 SERVICE_UNAVAILABLE (`session_store_unavailable`), 500 INTERNAL_SERVER_ERROR.
- Production: 503 and 500 keep their status and code, and the message becomes `Internal server error`. A 409 keeps its message.

### Finding 4 (IMPORTANT): no request-level throttle on /api/graphql (ruling R6)

**Fix.** New file `graphql/graphql-throttle.middleware.ts`, `GraphqlThrottleMiddleware`:
- It injects `getOptionsToken()` and `getStorageToken()` from the global `ThrottlerModule` and uses the `default` throttler's `ttl` and `limit`. If those are missing or are resolver functions, it falls back to 120 requests per 60 s.
- The tracker is `normalizeIp(req.ip)`, the same one `ThrottlerGuard` uses. The key is `graphql-request:<ip>` and the block duration equals the ttl.
- When over the limit, it answers HTTP 429 with a `Retry-After` header and `{ errors: [{ message: 'Too Many Requests', extensions: { code: 'TOO_MANY_REQUESTS' } }] }`.

`ApiGraphqlModule` now implements `NestModule.configure` with `forRoutes({ path: 'graphql', method: ALL })`, which becomes `/api/graphql` under the global prefix. Nest binds this middleware before Apollo's `app.all(path)` route, which `@nestjs/apollo` registers in `onModuleInit`. The per-resolver guard is unchanged.

**RED.** The fourth request inside a limit of 3 returned 401, not 429.

**GREEN.** New describe block, "request-level throttle floor on /api/graphql". The test app is built with the `default` limit set to 3.
- Three requests that no resolver counts all use up the limit: unauthenticated (401), unparseable (400) and batched (400).
- The fourth request (unauthenticated) and the fifth (authenticated, with CSRF token) both get 429 `TOO_MANY_REQUESTS`.
- `calls === 0`: no resolver ran.
- A REST route on the same app is unaffected.

### Covering tests, command, output

- `apps/api/src/app/graphql/__tests__/graphql-limits.unit.test.ts`: 14 tests
- `apps/api/src/app/graphql/__tests__/graphql.integration.unit.test.ts`: 26 tests
- `apps/api/src/app/graphql/__tests__/schema-emitter.unit.test.ts`: 2 tests

`npx vitest run --root apps/api graphql`: Test Files 3 passed (3), Tests 42 passed (42).

`yarn nx run-many -t lint test build -p api create-icore`:
- api: 21 files, 189 tests passed
- create-icore: 46 files, 451 tests passed
- lint OK
- `webpack compiled successfully`

The pre-commit hook passed. I discarded the regenerated `tools/create-icore/templates/` drift before committing.

### Notes

- The middleware needs the global `ThrottlerModule`, which the gateway already provides. Task 4 and Task 7 must keep `ThrottlerModule.forRoot` in any app that imports `ApiGraphqlModule`, or Nest fails at boot with a DI error.
- A document with several root fields is still counted once per resolver by the guard, on top of the request floor. Kept, as the ruling says.
