# Task 4b report: public health GraphQL query

## Built
- `apps/api/src/app/graphql/health.model.ts`, `health.resolver.ts` (`@Public()` + `@SkipCsrf()` + `@Query(() => Health)`), registered in `ApiGraphqlModule` providers and in `API_SURFACE_RESOLVERS`.
- `@Public`/`IS_PUBLIC_KEY` moved to `apps/api/src/app/http/public.decorator.ts`; `auth/public.decorator.ts` is now `export * from '../http/public.decorator'`.
- `apps/api/schema.gql` regenerated with `yarn nx run api:graphql-schema` (adds `type Health { status: String! }` and `health: Health!`).

## http/ ships in auth=none (evidence, exclusion lists untouched)
- `tools/create-icore/src/lib/scaffold-auth-none.ts` `AUTH_ONLY_PATHS`: excludes `apps/api/src/app/auth`, `profile`, `abilities`, `graphql` (still, for a later task), but nothing under `apps/api/src/app/http`.
- `tools/create-icore/src/manifest/resolve.ts` `AUTH_NONE_EXCLUDED_PATHS`: excludes only one file under http, `http/__tests__/csrf.guard.unit.test.ts`. `http/public.decorator.ts` and `skip-csrf.decorator.ts` ship.
- NOTE for later: `AUTH_ONLY_PATHS` still excludes `apps/api/src/app/graphql` and `emit-schema.ts`; the create-icore task that enables graphql with auth=none must drop those. Also `graphql/__tests__/graphql.integration.unit.test.ts` imports `../../auth/auth.guard` and would need excluding/guarding in auth=none.

## RED
Tests written first; `npx vitest run --root apps/api src/app/graphql` -> 3 files failed, 2 tests failed (schema snapshot lacked `health: Health!`; health.resolver test could not import missing modules; integration health test failed).
## GREEN
- `npx vitest run --root apps/api`: 26 files, 226 tests passed.
- create-icore: 47 files, 505 tests passed.
- `yarn nx lint api` exit 0 (only pre-existing e2e jest-config warnings), `yarn nx build api` success, `tsc --noEmit` on tsconfig.spec.json and tsconfig.app.json: no errors. Prettier run on touched files.

## Tests added
health.resolver.unit.test.ts (resolver returns ok; Public+SkipCsrf metadata; auth/ and http/ Public are identical), integration: health with no session and no CSRF -> 200 `ok`; guarded `ping` without session still 401; schema test asserts `health: Health!` and `type Health`.

## Files
apps/api/schema.gql; auth/public.decorator.ts; http/public.decorator.ts (new); graphql/{health.model,health.resolver}.ts (new), graphql.module.ts, api-surface-resolvers.ts; three test files. No templates/ drift.

## Concerns
None blocking; see NOTE above. `me` 401-without-session is covered by existing test (unchanged, green).
