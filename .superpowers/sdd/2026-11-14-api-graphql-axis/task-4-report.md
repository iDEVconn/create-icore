# Task 4 report: Resolvers, models and the committed schema

Status: DONE_WITH_CONCERNS
Commit: `76a7053 feat(api): GraphQL surfaces for notes, profile and storage` on `feature/api-graphql` (not pushed). The pre-commit hook passed. I discarded the regenerated `tools/create-icore/templates/` drift before committing.

## What was built

### Models and inputs

Every `@Field`, `@Query`, `@Mutation` and `@Args` names its type explicitly.

| File | Type | Fields |
| --- | --- | --- |
| `notes/graphql/note.model.ts` | `Note` (class `NoteModel`) | `id`, `ownerId`, `title`, `body`, `createdAt`, `updatedAt`, all `String!` |
| `notes/graphql/note.model.ts` | `NotePage` | `items: [Note!]!`, `total: Int!` |
| `notes/graphql/note.inputs.ts` | `CreateNoteInput` | `title`, `body`, both `String!` |
| `notes/graphql/note.inputs.ts` | `UpdateNoteInput` | `title`, `body`, both nullable `String` |
| `profile/graphql/profile.model.ts` | `Profile` | `uid: String!`, `email: String!`, `role: String` (nullable, see concern 2) |
| `storage/graphql/storage.model.ts` | `StorageRef` | `bucket`, `path`, both `String!` |

### Resolvers

They only delegate. No new rules.

- **`NotesResolver`**
  - `notes(limit, offset)` calls `gateway.list`, `note(id: ID!)` calls `gateway.get`.
  - `createNote` has `@CheckAbility('create','Note')`, like the REST controller, and calls `gateway.create`.
  - `updateNote` calls `gateway.update`.
  - `deleteNote` calls `gateway.remove` and returns `true`.
- **`ProfileResolver.me`** returns the `@CurrentUser()` session user. If no user is attached it throws `UnauthorizedException`, so the error is a 401 and not a "null in a non-null field" error. The global `AuthGuard` already stops anonymous callers, and nothing is `@Public()`.
- **`StorageResolver`**
  - `files(prefix)` calls `uploadClient.list(uid, prefix)`.
  - `signedUrl(bucket, path, ttlSec)` and `removeFile(bucket, path)` call `assertOwnership` first, then the upload client. `removeFile` returns `true`.
  - A small `uidOf(user)` helper throws a 401 when no user is attached. It replaces the `user!.uid` non-null assertions, which lint warned about.

### Modules

- **`NotesGraphqlModule`** (ruling R2): imports `NotesClientModule.forRoot()` and `AbilitiesModule`, provides `NotesGatewayService` and `NotesResolver`, and exports `NotesGatewayService`.
- **`ProfileGraphqlModule`**: provides `ProfileResolver`.
- **`StorageGraphqlModule`**: imports `UploadClientModule.forRoot()` and exports it.
- **`graphql/api-surfaces.module.ts`** (`ApiSurfacesModule`): imports `ApiGraphqlModule` and the three GraphQL modules. Nothing imports it in production. I checked:
  - `app.module.ts`, `features.module.ts` and `main.ts` contain no GraphQL import.
  - `dist/apps/api/main.js` has 0 matches for `NotesResolver`, `StorageResolver` or `ApiSurfacesModule`.

### Other new and changed files

- **`graphql/api-surface-resolvers.ts`**: `API_SURFACE_RESOLVERS = [NotesResolver, ProfileResolver, StorageResolver]`. It is the single list used by both `scripts/emit-schema.ts` (ruling R1, placeholder removed) and the schema snapshot test. It is a separate file so that printing the schema never loads Apollo or the microservice client modules.
- **`storage/storage.controllers.graphql.ts`**: exports `STORAGE_REST_CONTROLLERS = [StorageFilesController]`. Nothing imports it yet, and it compiles in the build.
- **`apps/api/schema.gql`**: generated with `yarn nx run api:graphql-schema` and committed.

## Deviations (please confirm)

1. **The `api:graphql-schema` target now runs under `@swc-node/register` instead of `tsx`.**
   - New command: `node -r @swc-node/register apps/api/scripts/emit-schema.ts` with `env.SWC_NODE_PROJECT=apps/api/tsconfig.app.json`.
   - Why: the real resolvers could not be emitted under tsx, even with every type given explicitly. `@nestjs/graphql`'s `@Args` always calls `reflectTypeFromMetadata`, which reads `Reflect.getMetadata('design:paramtypes', ...)[index]`. Without decorator metadata that throws `TypeError: Cannot read properties of undefined (reading '2')`, whether or not `type:` is given. Task 3's placeholder had no `@Args`, so it never hit this.
   - A second tsx problem: tsx applies `experimentalDecorators` only to files inside the tsconfig `include`, so it failed on `libs/notes-client` (`Parameter decorators only work when experimental decorators are enabled`).
   - swc-node emits metadata the same way the webpack and tsc build does, and it resolves the `@icore/*` paths.
   - It is already a root devDependency and is in `_template-shell/package.json`. `tsx` is **not** in `_template-shell`, so the tsx target would not have worked in generated projects anyway.
   - The script header comment now explains this.
2. **`.prettierignore` gains `apps/api/schema.gql`.** Running `prettier --write` on the file (the AGENTS.md routine) rewrites one-line `"""descriptions"""` into three lines. The file then no longer matches the emitter, so both the snapshot test and the CI schema drift check would fail. CI's format check only covers ts/tsx/json today, so this is protective. `.prettierignore` is snapshotted into templates, so generated projects inherit it.
3. **create-icore interim exclusion (`tools/create-icore/src/manifest/resolve.ts`).**
   - New `GRAPHQL_SURFACE_PATHS` (`apps/api/src/app/graphql`, `apps/api/scripts/emit-schema.ts`, `apps/api/schema.gql`) are excluded when `example=none` or `upload=none`.
   - Why: `ApiSurfacesModule` and `api-surface-resolvers.ts` import the notes and storage GraphQL modules, and those directories are removed with their features. I checked with a throwaway probe test (deleted) against the real snapshot. With `--auth=supabase --example=none`, `auditProject` reported `import-of-absent-lib` (the integration test imports `@icore/notes-client`). With `upload=none`, the audit passed, but `api-surfaces.module.ts` would import the missing `../storage/graphql/...`. That would break the CI `no-upload` and `firebase-minimal` typecheck combos.
   - After the fix, the probe showed no graphql or surface references in either scaffold, and the audit was clean.
   - Covered by new `resolve.unit.test.ts` cases, RED then GREEN (below). Task 7's `--api` axis should replace this with per-feature wiring.
   - Like Task 3's auth=none exclusion, these scaffolds keep the `graphql-schema` target in `project.json`, pointing at a script that was removed.
4. **The `send()` helper in the integration test** gained an optional `sid` so one app can serve several sessions. Existing tests are unchanged.

## Tests

### New unit tests

- **`notes/graphql/__tests__/notes.resolver.unit.test.ts`** (10)
  - Each operation passes the session user and its arguments to the gateway.
  - Missing paging is passed through as `undefined`.
  - NotFound and Forbidden errors from the gateway propagate unchanged.
  - `createNote` carries `CHECK_ABILITY_KEY` = `{create, Note}`.
  - `deleteNote` returns `true`.
- **`profile/graphql/__tests__/profile.resolver.unit.test.ts`** (2): `me` returns the session user, and throws 401 without one.
- **`storage/graphql/__tests__/storage.resolver.unit.test.ts`** (6)
  - Successful calls delegate with the uid.
  - A foreign ref gives `ForbiddenException` and the client is not called (signedUrl and removeFile).
  - No user gives 401 and the client is not called.
- **`graphql/__tests__/schema.unit.test.ts`** (2)
  - `emitSchema(API_SURFACE_RESOLVERS)` equals the committed `apps/api/schema.gql`. It only reads the file and never writes it.
  - A contract test checks the brief's operation signatures and the exact type shapes, inputs included.

### New integration tests

A new describe block, "API surfaces over /api/graphql" (12 tests), in `graphql.integration.unit.test.ts`.

The app under test:
- the real `ApiSurfacesModule`, plus the REST `NotesModule` (as in `api=both`)
- real `NotesGatewayService`, `AbilityGuard`, `AuthGuard`, `CsrfGuard` and throttler guard
- three sessions: user `ua`, user `ub` and an admin
- only `NotesClientService`, `UploadClientService` and their transport tokens faked

What the tests check (review focus 4):
- **User `ua` lists notes**: only their own note, and the result is deep-equal to REST `GET /api/notes` for the same session.
- **Admin lists notes**: both notes, deep-equal to REST.
- **`ub` reads `note(id)` on `ua`'s note**: 403 `FORBIDDEN`, `data: null`.
- **`ub` calls `updateNote` on `ua`'s note**: HTTP 403, `extensions.code` `FORBIDDEN`, message `Forbidden` (so the ability check fired, not CSRF). The client `update` is not called and the stored note is unchanged.
- **Admin calls `updateNote` on `ub`'s note**: 200.
- **`deleteNote` on a missing id**: HTTP 404 `NOT_FOUND`.
- **`createNote`**: owned by the session user.
- **`me`**: returns `{uid:'ua', email:'ua@example.com', role:'user'}`. Without a session it is 401 `UNAUTHENTICATED`.
- **`signedUrl` on a foreign path**: 403 `FORBIDDEN`, message `foreign_storage_ref`, client not called.
- **Own `signedUrl` and `files`**: work.
- **`removeFile` on a foreign path**: 403 `FORBIDDEN`.

### CurrentUser decorator test

Task 3 already added it (`http/__tests__/current-user.decorator.unit.test.ts`, 3 tests), so nothing new was needed.

## RED evidence

`npx vitest run --root apps/api graphql resolver schema`, before any implementation:

```
FAIL src/app/graphql/__tests__/graphql.integration.unit.test.ts  Error: Cannot find module '../api-surfaces.module'
FAIL src/app/graphql/__tests__/schema.unit.test.ts               Error: Cannot find module '../api-surfaces.module'
FAIL src/app/profile/graphql/__tests__/profile.resolver.unit.test.ts  Error: Cannot find module '../profile.resolver'
FAIL src/app/notes/graphql/__tests__/notes.resolver.unit.test.ts      Error: Cannot find module '../notes.resolver'
FAIL src/app/storage/graphql/__tests__/storage.resolver.unit.test.ts  Error: Cannot find module '../storage.resolver'
Test Files  5 failed | 2 passed (7)
```

- The first integration run after implementing failed in `beforeAll` with `assertTransportEnv` (NOTES_* transport env). Fixed by overriding the `NOTES_CLIENT`/`UPLOAD_CLIENT` tokens in the test.
- The `yarn nx run api:graphql-schema` failures under tsx (two different errors, see deviation 1) came before the switch to swc-node.
- The resolve exclusion test: 2 failed (`excludes them when example=none`, `... upload=none`), 1 passed.

## GREEN evidence

- `npx vitest run --root apps/api graphql resolver schema`: all pass.
- `yarn nx run-many -t lint test build -p api`:
  - lint: 0 errors, 0 warnings in the touched files
  - api tests: **25 files, 221 tests passed**
  - build: `webpack compiled successfully`
- `yarn nx run api:graphql-schema`: writes the schema. Running it again leaves the file unchanged, and the snapshot test passes against it.
- `yarn nx run-many -t lint test -p create-icore`: **46 files, 454 tests passed**, lint OK. A plain `npx vitest run` in `tools/create-icore` before the resolve change also gave 46 files, 451 passed: the existing audits are green.

## Self-review

- **No duplicated rules.** Ownership and admin visibility come only from `NotesGatewayService` and `assertOwnership`. The integration test compares GraphQL and REST lists on the same data.
- **`notes(limit, offset)`** passes `null` through as `undefined`, so the gateway applies its defaults and the clamp to 100.
- **`AbilitiesModule` registers `AbilityGuard` as `APP_GUARD`.** It is imported by both `NotesModule` and `NotesGraphqlModule`, which Nest dedupes. The `both` combination is exercised by the integration test.
- **Guard order** in the test mirrors the gateway: `AuthGuard`, from a module imported before the surfaces, runs before `AbilityGuard`.

## Concerns

1. **Deviation 1** changes Task 3's target runner. Task 7's api unit and the CI schema-drift step should call `nx run api:graphql-schema` and not invoke tsx directly.
2. **`Profile.role` is nullable.** `SessionRecord.role` is optional, and the gateway logs "role resolution failed, session starts with no role". The plan's client interface for Task 5 says `role: string`, so codegen will give `role?: string | null`. The client overlay must handle that, or the owner decides to default it.
3. **Every `Note` field is `String`**, `id` included, per the brief's literal "as `String`". Arguments use `ID!` as the brief specifies.
4. **Interim create-icore exclusion (deviation 3)** removes the whole GraphQL API from `example=none` or `upload=none` scaffolds until Task 7. It also leaves a dangling `graphql-schema` target there, as the Task 3 auth=none case already does.
5. **Unrelated observation:** `apps/api/ruvector.db` (untracked, gitignored) gets copied into scaffolds by the snapshot. I saw it in a probe scaffold, and it is outside this task.
6. **No `docs/` update.** This is wiring for a later task; nothing user-facing changes yet.

## Files changed

- `.prettierignore`
- `apps/api/project.json`, `apps/api/scripts/emit-schema.ts`, `apps/api/schema.gql` (new)
- `apps/api/src/app/graphql/{api-surfaces.module.ts,api-surface-resolvers.ts}` (new), `graphql/__tests__/schema.unit.test.ts` (new), `graphql/__tests__/graphql.integration.unit.test.ts`
- `apps/api/src/app/notes/graphql/{note.model.ts,note.inputs.ts,notes.resolver.ts,notes-graphql.module.ts,__tests__/notes.resolver.unit.test.ts}`
- `apps/api/src/app/profile/graphql/{profile.model.ts,profile.resolver.ts,profile-graphql.module.ts,__tests__/profile.resolver.unit.test.ts}`
- `apps/api/src/app/storage/graphql/{storage.model.ts,storage.resolver.ts,storage-graphql.module.ts,__tests__/storage.resolver.unit.test.ts}`
- `apps/api/src/app/storage/storage.controllers.graphql.ts`
- `tools/create-icore/src/manifest/resolve.ts`, `tools/create-icore/src/manifest/__tests__/resolve.unit.test.ts`
