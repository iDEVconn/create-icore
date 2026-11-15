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

