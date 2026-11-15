# Task 7b-1 report: server side of the `--api` axis in create-icore

Status: DONE_WITH_CONCERNS (one pre-existing smoke failure, not caused by this task; see Concerns 1)

Commits (branch `feature/api-graphql`, not pushed):
- `fbbb195` feat(create-icore): wire the --api axis on the gateway
- `4b5ec09` test(create-icore): real-template scaffold tests for the --api server side

## What was built

### A. `manifest/resolve.ts`: api-aware exclusions (stopgap `GRAPHQL_SURFACE_PATHS` removed)
`apiExcludedPaths(opts)` feeds `addExcludedPath` in `resolveBindings`:
- `rest`: `API_REST_EXCLUDED_PATHS` = `apps/api/src/app/graphql`, `{notes,profile,storage}/graphql`, `apps/api/schema.gql`, `apps/api/scripts/emit-schema.ts`, `storage/storage.controllers.graphql.ts`.
- `graphql|both`: always `API_SCHEMA_EXCLUDED_PATHS` = `apps/api/schema.gql` (R12) **and** `graphql/__tests__/schema.unit.test.ts` (it compares the emitted schema with the committed file, which no longer ships: it would fail in every generated project).
- `graphql`: `API_GRAPHQL_EXCLUDED_PATHS` = notes controller, notes module, notes controller test, profile controller, profile module. Plus `storage/storage.controller.ts` (the list/signed-url/remove controller, dead once the registry is swapped) only when a StorageResolver exists (auth != none and upload != none).
- swap file `storage.controllers.graphql.ts` is excluded whenever it will not be swapped (rest, both, graphql without StorageResolver).
- auth=none + graphql/both: `API_AUTH_NONE_EXCLUDED_PATHS` = the three per-feature graphql dirs, `graphql.integration.unit.test.ts` (imports `../../auth/auth.guard`, `@icore/auth-client`) and `health.resolver.unit.test.ts` (imports `../../auth/public.decorator`). Found by grep of every graphql test's imports; `schema-emitter`, `graphql-limits` tests import nothing auth-only and stay.
- `graphql.integration.unit.test.ts` ships only for `both` + auth + notes + upload: it imports the REST `NotesModule` (absent in graphql), `@icore/notes-client`, `@icore/upload-client` and expects the full ApiSurfacesModule.
- Absent features: `apps/api/src/app/notes` (notes unit libDirs), `.../storage` (UPLOAD_NONE), `.../profile` (AUTH_NONE) already drop the per-feature dirs; covered by tests.

### `lib/scaffold-auth-none.ts`
- `AUTH_ONLY_PATHS` no longer lists the graphql paths; `removeAuthOnlyPaths(targetDir, api = 'rest')` removes `graphql` + `emit-schema.ts` for rest and only the auth-only graphql paths (per-feature dirs + the two tests) for graphql/both. Stale comment ("a GraphQL API needs auth") gone.
- Part C: new `GATEWAY_APP_MODULE_GRAPHQL_TS` (identical to today's overlay except `ThrottlerModule.forRoot(throttlerOptions)` from `./http/throttler.config`, no `seconds`, no APP_GUARD); `applyAuthNoneVariants(targetDir, ui, api = 'rest')` uses it for graphql/both. `rest` keeps `GATEWAY_APP_MODULE_TS` byte for byte (pinned by two tests).

### B. `manifest/wire-api.ts` (`wireApi(targetDir, opts)`), called in `lib/scaffold.ts` right after `writeFeaturesWiring` (so after `removeAuthOnlyPaths`/`applyAuthNoneVariants`, `removeUploadStack`, `cleanupUnusedFeatures`)
- graphql/both: generates `api-surfaces.module.ts` (`ApiGraphqlModule` + `NotesGraphqlModule` iff notes, `ProfileGraphqlModule` iff auth, `StorageGraphqlModule` iff upload and auth) and `api-surface-resolvers.ts` (`HealthResolver` + matching resolvers). Output is prettier-formatted (one-line list when it fits in 100 cols, else one item per line).
- app.module.ts: adds `import { ApiSurfacesModule } ...` after the last import and `ApiSurfacesModule,` before `FeaturesModule,` (works for repo module and auth-none overlay; throws a clear error if the `FeaturesModule` anchor is missing). graphql also removes the `ProfileModule` import and entry.
- storage: graphql + StorageResolver renames `storage.controllers.graphql.ts` over `storage.controllers.ts`; otherwise deletes the swap file if present.
- rest: strips `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`, `graphql`, `@as-integrations/express5` from `apps/api/package.json`, removes the `graphql-schema` target from `project.json`, the express5 entry (+ comment) from the eslint `ignoredDependencies`, and the graphql alias / `createRequire` from `apps/api/vitest.config.mts`. The vitest strip matters: `require.resolve('graphql')` runs at config load, and with the deps stripped a real-install rest project would not have `graphql` installed (link-mode smoke cannot see that). Verified: the four rest outputs (`package.json`, `project.json`, `eslint.config.mjs`, `vitest.config.mts`) are byte-identical to the branch base `a7d6975` versions.
- `manifest/wire-features.ts`: graphql does not import the REST `NotesModule`; `gateway-services.ts` keeps notes.

## RED / GREEN evidence
- resolve tests: `npx vitest run src/manifest/__tests__/resolve.unit.test.ts` -> RED `Tests 14 failed | 21 passed`; after implementing, one more failure revealed a real gap (auth=none + graphql would have excluded the storage REST controller although no StorageResolver exists) -> fixed -> GREEN 35/35.
- wire-features: RED `1 failed | 12 passed` (graphql still imported NotesModule) -> GREEN 13/13.
- wire-api: RED `Cannot find module '../wire-api.js'` -> GREEN 15/15.
- auth-none overlay/removal: RED `4 failed | 68 passed` -> GREEN 72/72.
- real-template `scaffold-api-server.unit.test.ts` (29 tests) passed on first run (written after the implementation); mutation check: with the `wireApi` call commented out in `scaffold.ts`, `14 failed | 15 passed` (including the "is sound" dangling-import checks), restored afterwards.
- Full suite `cd tools/create-icore && npx vitest run`: `Test Files 49 passed`, `Tests 571 passed` (was 505 before Task 7b-1 started... 542 after the first commit).
- `yarn nx run-many -t lint build -p create-icore`: 4 tasks succeeded.
- `yarn nx run-many -t lint test build -p api --skip-nx-cache`: 10 tasks succeeded (apps/api untouched).
- tsc: `tsconfig.lib.json` 10 errors before and after; `tsconfig.spec.json` 15 before and after (none in touched files).

## Real-template scaffold tests (`tools/create-icore/src/lib/__tests__/scaffold-api-server.unit.test.ts`)
Each project is checked with `auditProject()` (no violations) and a new dangling-relative-import check over `apps/api/src` + `apps/api/scripts`:
1. rest (supabase, notes, upload): no path matching `/graphql|schema\.gql/i` outside `apps/client` (client is B-2), no GraphQL deps, no `graphql-schema`, no graphql in vitest/eslint configs, REST controllers present.
2. graphql: notes/profile controllers+modules, storage list controller, swap file, schema.gql absent; all resolvers/modules present; ApiSurfacesModule imports exactly the 3 surfaces; app.module has ApiSurfacesModule, no ProfileModule; registry = `[StorageFilesController]`; features.module without NotesModule, gateway-services lists notes; schema/integration tests absent.
3. both: controllers and resolvers, integration test present, ProfileModule kept + ApiSurfacesModule.
4. graphql --example=none --upload=none: only ProfileGraphqlModule; resolvers Health + Profile.
5. auth=none graphql (upload=supabase) and both (upload=none): only ApiGraphqlModule; health resolver ships; per-feature dirs and auth-importing tests absent; app.module registers `throttlerOptions` + ApiSurfacesModule, no APP_GUARD; storage stays REST with auth=none.
6. rest + auth=none: app.module is exactly today's overlay; no graphql dir.

## Smoke (link mode, `--ui=shadcn --projects=shared,auth,upload,notes,api`, after `yarn nx build create-icore` + snapshot)
| combo | result |
|---|---|
| graphql supabase notes upload (`--services=api,auth,upload,notes`) | smoke OK |
| both, same | smoke OK |
| graphql `--example=none --upload=none` (`--services=api,auth`) | smoke OK |
| graphql `--auth=none --db=none --upload=none --example=none` (`--services=api`) | **FAILED**, pre-existing, see Concern 1 |
| rest supabase notes upload (regression) | smoke OK |
| extra: graphql / both / rest with `--auth=none --db=none --upload=supabase --example=none` | smoke OK (all three) |
| extra: rest `--auth=none --db=none --upload=none --example=none` | **FAILED** identically (proves Concern 1 is not api-related) |

Beyond the brief (link smoke only typechecks): in four generated projects (graphql full, graphql min, graphql auth=none, both) with the repo's node_modules symlinked I ran the gateway's own vitest suite and the schema emitter: graphql full 19 files / 158 tests, graphql min 15 / 128, auth=none 9 / 49, both 21 / 207, all passing; `emit-schema.ts` produced the expected schemas (full; `health` + `me`; `health` only). Generated `api-surfaces.module.ts`, `api-surface-resolvers.ts`, `app.module.ts`, `features.module.ts`, `storage.controllers.ts` pass `prettier --check`.

## Files changed
- `tools/create-icore/src/manifest/resolve.ts`
- `tools/create-icore/src/manifest/wire-api.ts` (new)
- `tools/create-icore/src/manifest/wire-features.ts`
- `tools/create-icore/src/lib/scaffold.ts`
- `tools/create-icore/src/lib/scaffold-auth-none.ts`
- `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts`
- `tools/create-icore/src/manifest/__tests__/wire-features.unit.test.ts`
- `tools/create-icore/src/manifest/__tests__/wire-api.unit.test.ts` (new; fixture = the repo's real gateway files, so an anchor change in app.module.ts fails here)
- `tools/create-icore/src/lib/__tests__/scaffold.unit.test.ts`
- `tools/create-icore/src/lib/__tests__/scaffold-api-server.unit.test.ts` (new)
- `tools/create-icore/templates/` re-dirtied by the snapshot: restored with `git checkout` before each commit.

## Self-review / decisions taken beyond the literal brief
- Excluded `graphql/__tests__/schema.unit.test.ts` for graphql/both: direct consequence of R12 (the test reads the non-shipped `schema.gql`).
- Excluded `graphql.integration.unit.test.ts` except in `both` + auth + notes + upload: it imports the REST NotesModule and the notes/upload clients. Generated graphql projects therefore lose the HTTP-level GraphQL integration test (repo CI keeps it). A per-mode integration test is a possible follow-up.
- Excluded `storage/storage.controller.ts` for graphql when the StorageResolver exists: it is unreferenced after the registry swap (spec section 1: REST controllers of surfaced features are excluded).
- Stripped the vitest graphql alias and the eslint express5 exemption for rest (brief allowed the eslint one "if harmful"; the vitest alias would break a real-install rest project).
- No changes to client files, client exclusion lists, `rewriteClientPaths`, `applyApiVariants`, `vite.config.mts` (B-2).
- No docs updated (AGENTS.md routine step 4): left to the dispatch that finishes Task 7 (B-2/final), since the behaviour is only complete with the client side.

## Concerns
1. **Pre-existing regression (Task 1), all-none auth=none combo, every api mode:** `apps/api/src/app/http/current-user.decorator.ts` imports `VerifiedToken` from `@icore/shared`, which lives in `libs/shared/src/strategies/auth.ts`; `removeStrategiesLib` deletes it when auth, upload, db, payment, ai are all none, so `tsc -p apps/api/tsconfig.app.json` fails (`TS2305: Module '"@icore/shared"' has no exported member 'VerifiedToken'`). Reproduced with `--api=rest` too, so not caused by this task; it was green on `dev` (CurrentUser did not exist). `CurrentUser` is used only by the notes/profile/storage resolvers (all auth-only). Suggested fix (needs the controller's ruling because it changes rest + auth=none output by removing a dead file): add `apps/api/src/app/http/current-user.decorator.ts` and `apps/api/src/app/http/__tests__/current-user.decorator.unit.test.ts` to `AUTH_NONE_EXCLUDED_PATHS` (and `AUTH_ONLY_PATHS`), or make the decorator not depend on `VerifiedToken` from the strategies barrel. Either keeps behaviour unchanged.
2. `tools/remove-notes.mjs` (shipped with notes) does not know about `notes/graphql` or the generated `api-surfaces.module.ts` / `api-surface-resolvers.ts`: running it in a graphql/both project would leave dangling NotesGraphqlModule/NotesResolver imports. Not in scope; follow-up.
3. The rest golden file-list test (whole project) and the client half are B-2; my rest test excludes `apps/client/` from the "no graphql path" check until then.

## Fix round 1 (R14-R16)

Commits: `a87bd44` fix(api): decouple CurrentUser from the strategies folder; `3e85a0d` fix(create-icore): make remove-notes aware of the --api modes.

### R14: CurrentUser decoupled from `@icore/shared` strategies
- `apps/api/src/app/http/current-user.decorator.ts` declares `export interface CurrentUserPayload { uid: string; email?: string; role?: string | null }` and returns `CurrentUserPayload | undefined`; no import from `@icore/shared`. Its test imports nothing from shared and adds a compile-time pin that a `VerifiedToken`-shaped type (`{ uid; email?; role? }`) is assignable to `CurrentUserPayload`.
- Guard test (new) `tools/create-icore/src/lib/__tests__/gateway-strategies-coupling.unit.test.ts`: derives the symbol list from what `removeStrategiesLib` deletes (every export of `libs/shared/src/strategies/**`, `transport.ts`, `local-transport.ts`) and asserts that no non-test file in `apps/api/src/app/http/`, `apps/api/src/app/graphql/` (minus the generated `api-surfaces.module.ts` / `api-surface-resolvers.ts`) and `apps/api/src/main.ts` imports one of them from `@icore/shared`.
  - RED: `Tests 1 failed | 15 passed`, `current-user.decorator.ts` -> `["VerifiedToken"]` (only offender).
  - GREEN: `Tests 16 passed`.
- Other couplings: grep of `@icore/shared` imports in the files that ship in all-none projects found only `verifyCsrf` (`libs/shared/src/http`), `formatGatewayBanner` (`env.ts`) and session-store symbols (`session/`), none removed by a strip step; the all-none smokes below confirm no other TS2305.

### R16: `tools/remove-notes.mjs`
- No tests existed (grep). Refactored: file edits in exported `removeNotesFiles(projectRoot)`; `main()` (nx `@nx/workspace:remove` calls + `removeNotesFiles`) runs only when executed directly. New edits: removes `NotesModule` from `features.module.ts` (the old script only edited `app.module.ts`, so even `rest` projects kept a dangling import), `NotesGraphqlModule` from `api-surfaces.module.ts`, `NotesResolver` from `api-surface-resolvers.ts`, the notes entry of `gateway-services.ts`, `graphql.integration.unit.test.ts`, and the client GraphQL notes files (`queries/notes.gql-api.ts` + its test, `graphql/notes.queries.ts`, `graphql/gql/notes.graphql`).
- Test (new) `tools/create-icore/src/lib/__tests__/remove-notes.unit.test.ts`: real scaffolds (`api=rest|graphql|both`, supabase, notes, upload), imports the shipped `tools/remove-notes.mjs` from the generated project and runs `removeNotesFiles`; asserts no notes symbol or dangling relative import in `apps/api/src`/`scripts`, no notes service entry, `auditProject` clean, surfaces = `[ApiGraphqlModule, ProfileGraphqlModule, StorageGraphqlModule]`, resolvers = `[HealthResolver, ProfileResolver, StorageResolver]`, client GraphQL notes files gone; plus `tsc --noEmit` on `apps/api/tsconfig.app.json` and `tsconfig.spec.json` of the transformed graphql project (repo node_modules symlinked).
  - RED: `Tests 4 failed`, `TypeError: mod.removeNotesFiles is not a function`.
  - GREEN: `Tests 4 passed`.

### R15: which gateway GraphQL tests ship per mode
| mode | graphql/__tests__ shipped | per-feature graphql tests |
|---|---|---|
| rest | none (whole graphql dir excluded) | none |
| graphql, auth | `graphql-limits`, `health.resolver`, `schema-emitter` | notes/profile/storage resolver tests for the selected features |
| both, auth, notes + upload | `graphql-limits`, `health.resolver`, `schema-emitter`, `graphql.integration` | notes/profile/storage resolver tests |
| both, auth, without notes or upload | `graphql-limits`, `health.resolver`, `schema-emitter` | resolver tests for the selected features |
| graphql/both, auth=none | `graphql-limits`, `schema-emitter` | none |
`schema.unit.test.ts` never ships in generated projects. REST tests: graphql drops `notes.controller.unit.test.ts`; everything else REST ships as before.

### Verification
- `cd tools/create-icore && npx vitest run`: `Test Files 51 passed`, `Tests 591 passed`.
- `yarn nx run-many -t lint test build -p api --skip-nx-cache`: 10 tasks succeeded.
- `yarn nx run-many -t lint build -p create-icore --skip-nx-cache`: 4 tasks succeeded.
- `npx tsc --noEmit -p apps/api/tsconfig.spec.json` exit 0; `-p apps/api/tsconfig.app.json` exit 0.
- create-icore tsc: lib 10, spec 15 (unchanged).
- prettier on all touched files clean; `tools/create-icore/templates` restored before each commit.

### Smoke (link mode, after `yarn nx build create-icore` + snapshot; `--ui=shadcn --projects=shared,auth,upload,notes,api`)
| combo | result |
|---|---|
| rest `--auth=none --db=none --upload=none --example=none` | smoke OK (was FAILED) |
| graphql `--auth=none --db=none --upload=none --example=none` | smoke OK (was FAILED) |
| both `--auth=none --db=none --upload=none --example=none` | smoke OK |
| graphql supabase notes upload | smoke OK |
| both supabase notes upload | smoke OK |
| graphql `--example=none --upload=none` | smoke OK |
| rest supabase notes upload | smoke OK |
(R16 touches only `tools/remove-notes.mjs`, which the smoke does not run; its coverage is the tsc in `remove-notes.unit.test.ts`.)
