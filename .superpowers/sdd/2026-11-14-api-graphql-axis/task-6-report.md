# Task 6 report: Client GraphQL layer (all three templates)

Status: DONE_WITH_CONCERNS (concerns are small and listed at the end)
Commit: `a39a515 feat(client): GraphQL data layer on TanStack Query with .graphql files` (branch `feature/api-graphql`, not pushed)

## What was built

Per template `apps/templates/client-{shadcn,antd,mui}/`, byte-identical:

- `graphql-loader.d.ts`: declares `*.graphql` modules as `DocumentNode` from `graphql`.
- `codegen.ts`: `@graphql-codegen/cli` config. The schema is `../../../apps/api/schema.gql` and the documents are `src/graphql/gql/*.graphql`. Output goes to `src/gql/types.ts`. All paths use `path.resolve(import.meta.dirname, ...)`. Plugin: `typescript-operations` only (see Decision 1).
- `src/api/graphql.ts`: `request<TData, TVars extends Record<string, unknown>>(document, variables?)`.
  - Sends `api('/graphql', { method: 'POST', body: JSON.stringify({ query: print(document), variables, operationName }) })`. The `operationName` comes from the first operation in the document.
  - Returns `data`.
  - When `errors[]` is non-empty, throws `new ApiError(200, errors, messages.join('; '))` from `@idevconn/api-client`.
  - Also throws an `ApiError` when `data` is missing or null.
- `src/graphql/operation.ts`: `operation<TData, TVars>(document, name): TypedDocumentNode<TData, TVars>`, modelled on CBC's `getOperation`.
  - Returns the named operation plus the fragments it spreads, followed transitively. Unused fragments are dropped.
  - For an unknown name it throws `Operation "X" not found. Available operations: A, B, ...`.
- Operation files:
  - `src/graphql/gql/notes.graphql`: fragment `NoteFields`, plus `ListNotes`, `GetNote`, `CreateNote`, `UpdateNote` and `DeleteNote`.
  - `src/graphql/gql/profile.graphql`: `GetMe` (`me { uid email role }`).
- `src/graphql/notes.queries.ts` and `profile.queries.ts`: typed `TypedDocumentNode` exports (`ListNotes`, `GetNote`, `CreateNote`, `UpdateNote`, `DeleteNote`, `GetMe`), built with `operation()` and the codegen types.
- `src/gql/types.ts`: generated and committed. Identical in all three templates (`cmp` checked after running codegen in each).
- `src/queries/notes.graphql.ts`:
  - Same exports and signatures as `queries/notes.ts`: `Note`, `useNotesList(limit, offset)`, `useCreateNote()`, `useUpdateNote()` with `{id, patch}`, and `useDeleteNote()` with `id`.
  - Same query keys (`['notes', {limit, offset}]`), the same `invalidateQueries({ queryKey: ['notes'] })` and the same `notify.success(t('notes.saved'|'notes.deleted'))`.
  - `useNotesList` returns `{items, total}`, like REST.
- `src/queries/profile.graphql.ts`:
  - Same exports as `queries/profile.ts`: `Profile` with `role?: string | null`, `useProfile()` and `useUpdateProfile()`.
  - `useProfile` runs `GetMe` and returns `me` under key `['profile']`.
  - `useUpdateProfile` keeps the exact REST request (see Concern 1). It works with the per-call `save.mutate(name, { onSuccess })` style the page uses.
- Tests (same file in all three templates):
  - `src/api/__tests__/graphql.unit.test.ts` (4)
  - `src/graphql/__tests__/operation.unit.test.ts` (4; this file is extra to the brief's list and sits next to its source)
  - `src/queries/__tests__/notes.graphql.unit.test.ts` (5)
  - `src/queries/__tests__/profile.graphql.unit.test.ts` (3)

Modified per template:
- `vite.config.mts`: `import graphqlLoader from 'vite-plugin-graphql-loader'`, with `graphqlLoader()` placed after `react()` in `plugins`. The same file holds the vitest config, so tests get the loader too.
- `tsconfig.app.json` and `tsconfig.spec.json`: `include` now has `graphql-loader.d.ts`.
- `package.json`: `graphql` added to dependencies and the codegen/loader/typed-document packages to devDependencies. `workspace-ownership.unit.test.ts` needs every import declared at the root version.
- `project.json`: target `graphql-codegen`.
  - `nx:run-commands`, command `graphql-codegen --config codegen.ts`, `cwd` `apps/templates/client-<ui>`.
  - inputs: `codegen.ts`, `src/graphql/gql/*.graphql` and `{workspaceRoot}/apps/api/schema.gql`.
  - output: `src/gql/types.ts`.

Repo level:
- Root `package.json` devDependencies, plus `yarn.lock`.
- `.prettierignore` gets `**/src/gql/types.ts`. Evidence: `prettier --check` flagged the generated file. Formatting it would break the "codegen re-run equals committed file" property, as with `apps/api/schema.gql`.
- `tools/create-icore/src/lib/__tests__/client-graphql-parity.unit.test.ts` (23 tests):
  - every new shared file (tests included) exists and is byte-identical across the three templates, and so are `queries/notes.ts` and `queries/profile.ts`;
  - each template registers `graphqlLoader()` and the `graphql-codegen` target with the right command and cwd;
  - no production file under `src/routes`, `src/components`, `src/layouts`, `src/app` or `main.tsx` imports `queries/*.graphql`.

## New dependency versions (for `tools/create-icore/src/manifest/index.ts`)

Root `package.json` devDependencies; the template `package.json` files use the same specs:

- `vite-plugin-graphql-loader`: `^6.0.0` (resolved 6.0.0)
- `@graphql-codegen/cli`: `^8.0.0` (resolved 8.0.0)
- `@graphql-codegen/typescript-operations`: `^7.0.1` (resolved 7.0.1)
- `@graphql-typed-document-node/core`: `^3.2.0` (resolved 3.2.0)
- `graphql`: `^16.11.0` (already in root dependencies from Task 3; resolved 16.15.0). It is now also in each client template's `dependencies`, because `print`, `visit` and `Kind` are used at runtime.

`@graphql-codegen/typescript` was NOT added (Decision 1). It is still in `yarn.lock` as a transitive `^7.0.0` dependency of the codegen toolchain, which is harmless.

`sync-template-shell.mjs`: 0 deps synced (the shell has none of these). `yarn install --immutable` passes.

## Decisions the brief did not make

1. **No `typescript` codegen plugin.** With `plugins: ['typescript', 'typescript-operations']`, codegen 8 / typescript-operations 7 emitted `CreateNoteInput` and `UpdateNoteInput` twice: once from `typescript` with `Scalars[...]`, once from `typescript-operations`, which is standalone since v7 and emits the input types the operations use. Two type aliases with the same name are a TS error. So `typescript-operations` alone, and the dependency was dropped as unused.
   - Task 7's `MANIFEST.apiClient` should list 4 client devDeps plus `graphql`, not 5.
   - The plan/Tech Stack line still mentions `typescript`.
2. `ID` variables come out as `string | number` (typescript-operations 7 default), and `string` ids are accepted.
3. The GraphQL `useUpdateProfile` keeps REST (Concern 1).

## Codegen path notes for the later task (rewriteClientPaths)

`codegen.ts` has exactly one segment to rewrite:
`path.resolve(import.meta.dirname, '../../../apps/api/schema.gql')` becomes `'../../apps/api/schema.gql'` in `apps/client`.

The documents (`src/graphql/gql/*.graphql`) and output (`src/gql/types.ts`) paths are template-relative and need no change. Adding `'codegen.ts'` to the `candidates` list of `rewriteClientPaths` (`tools/create-icore/src/lib/scaffold.ts`) is enough: its `replaceAll('../../../', '../../')` handles it. The `client-<ui>` text in the comment does not match `client-${ui}`, so it is untouched, which is harmless.

`project.json`'s `cwd: apps/templates/client-<ui>` is already in that list and becomes `apps/client`.

Generated projects also need `**/src/gql/types.ts` in their `.prettierignore` if they ship one (the template shell has none today).

Task 7 must also strip `graphql`, `vite-plugin-graphql-loader`, `@graphql-codegen/*` and `@graphql-typed-document-node/core` from `apps/client/package.json` for `api=rest|both`. The templates now carry them because workspace-ownership requires it.

## RED evidence (before any implementation)

`npx vitest run --root apps/templates/client-shadcn graphql operation`:
```
FAIL src/graphql/__tests__/operation.unit.test.ts  Error: Failed to resolve import "../gql/notes.graphql"
FAIL src/api/__tests__/graphql.unit.test.ts        Error: Failed to resolve import "../graphql"
FAIL src/queries/__tests__/notes.graphql.unit.test.ts   Error: Failed to resolve import "../../graphql/notes.queries"
FAIL src/queries/__tests__/profile.graphql.unit.test.ts Error: Failed to resolve import "../../graphql/profile.queries"
Test Files  4 failed (4)
```
`npx vitest run --root tools/create-icore src/lib/__tests__/client-graphql-parity`: `Tests 18 failed | 5 passed (23)`. The passing tests were the REST `notes.ts`/`profile.ts` parity and the "production imports REST only" checks.

During implementation one test expectation changed: `ListNotes` extraction now expects the `NoteFields` fragment as well, because `notes.graphql` was written with a shared fragment. Fragment handling itself is still covered by the separate transitive-fragment test.

## GREEN evidence

- shadcn targeted run: `Test Files 4 passed (4) / Tests 16 passed (16)`. This test imports the real `notes.graphql`, so it proves `vite-plugin-graphql-loader` 6.0.0 works under Vite 8 + vitest 5.
- `yarn nx run-many -t lint test vite:build -p client-shadcn client-antd client-mui --skip-nx-cache`: `Successfully ran targets lint, test, vite:build for 3 projects`.
  - Tests: shadcn 51, antd 34, mui 33, all passing. The three `vite:build` runs succeeded, so the loader also works in the production build.
  - Lint: 0 errors. The one warning per template is pre-existing (`main.tsx` non-null assertion).
- `yarn nx test create-icore`: 47 files, 477 tests passed, including `client-graphql-parity` (23), `workspace-ownership` and `template-shell-drift`.
- `yarn nx lint create-icore`: green.
- `yarn nx run client-<ui>:graphql-codegen`: succeeds in all three, and `cmp` shows identical `src/gql/types.ts`.
  - Negative check: adding a bogus field `nope` to `profile.graphql` gave `GraphQL Document Validation failed ... Cannot query field "nope" on type "Profile"`, and the committed `types.ts` was left untouched. The file was then restored.
- `tsc --noEmit` app/spec per template compared with the baseline taken before any change: shadcn 0/1, antd 0/0, mui 23/23. The error lists are identical, so no new type errors.
- Prettier check over all touched files: clean.
- The pre-commit hook (lint-staged + affected lint/test) passed.
- The production client still imports only the REST `queries/notes` and `queries/profile`: no page changed, and the parity test asserts it.

## Files changed (commit a39a515)

- `.prettierignore`, `package.json`, `yarn.lock`
- `tools/create-icore/src/lib/__tests__/client-graphql-parity.unit.test.ts`
- Per template (shadcn, antd, mui):
  - modified: `package.json`, `project.json`, `tsconfig.app.json`, `tsconfig.spec.json`, `vite.config.mts`
  - new: `graphql-loader.d.ts`, `codegen.ts`
  - new: `src/api/graphql.ts`, `src/api/__tests__/graphql.unit.test.ts`
  - new: `src/graphql/operation.ts`, `src/graphql/__tests__/operation.unit.test.ts`
  - new: `src/graphql/gql/notes.graphql`, `src/graphql/gql/profile.graphql`
  - new: `src/graphql/notes.queries.ts`, `src/graphql/profile.queries.ts`
  - new: `src/gql/types.ts`
  - new: `src/queries/notes.graphql.ts`, `src/queries/profile.graphql.ts`
  - new: `src/queries/__tests__/notes.graphql.unit.test.ts`, `src/queries/__tests__/profile.graphql.unit.test.ts`

Discarded before the commit: `tools/create-icore/templates/apps/api/project.json` drift (build artifact).

## Self-review

- Review Focus 7: for every mutation (create, update, delete), a test asserts `invalidateQueries({ queryKey: ['notes'] })` and the same toast key as REST. For profile, `['profile']` is invalidated. A further test checks that a GraphQL `errors[]` response does NOT invalidate or toast: the mutation errors instead.
- `request` goes through the shared `api`, so CSRF, credentials, refresh, `onUnauthorized` and HTTP 401/403/429 behave as they do for REST.
- `Note` is duplicated in `notes.graphql.ts` on purpose: it is a swap file that replaces `notes.ts` wholesale.

## Concerns

1. **No GraphQL profile mutation exists.** The schema has only `me`, so `profile.graphql.ts`'s `useUpdateProfile` keeps the identical REST `PATCH /profile`. That endpoint does not exist on the gateway in any mode: `ProfileController` is GET-only. This gap predates Task 6 (Task 5 mirrored the page's call). In `api=graphql`, saving the profile therefore fails exactly as it does in REST today. A product decision is needed: add `updateProfile` to the gateway, or drop the save button.
2. `codegen.ts` uses `import.meta.dirname`, as the brief asked. graphql-codegen loads it through jiti and runs fine, and it typechecks under `module esnext / moduleResolution bundler`. But under `nodenext` in a package without `"type": "module"`, `tsc` would report TS1470. No tsconfig includes `codegen.ts` today, so nothing fails. If a later task adds it to a nodenext tsconfig, rename it to `codegen.mts` or keep it excluded.
3. The dependency list differs from the plan's Tech Stack: `@graphql-codegen/typescript` was dropped (Decision 1), so Task 7's manifest should follow this report, not the plan.

## Follow-up R8 (controller ruling)

1. **Rename (git mv, all three templates).**
   - `src/queries/notes.graphql.ts` became `notes.gql-api.ts`, and `profile.graphql.ts` became `profile.gql-api.ts`.
   - The tests became `__tests__/notes.gql-api.unit.test.ts` and `__tests__/profile.gql-api.unit.test.ts`, with their imports updated.
   - Also updated: the parity file list and its docstring, plus the plan (`docs/superpowers/plans/2026-11-14-api-graphql-axis.md`: Task 6 test list, Produces and Step 2; Task 7 `*.gql-api.ts` swap files and `src/queries/*.gql-api.ts` exclusion) and spec decision 10.
   - Grep after the rename: the remaining `notes.graphql` / `profile.graphql` hits are only the real operation files `src/graphql/gql/*.graphql`, the server `storage.controllers.graphql.ts`, and one deliberate guard fixture line in the parity test.
2. **List key pinned.** `notes.gql-api.unit.test.ts` now asserts `client.getQueryCache().find({ queryKey: ['notes', { limit: 20, offset: 40 }], exact: true })` holds the list data.
   - RED proof: temporarily changing the twin's key to `['notes-list', ...]` gave `× useNotesList sends ListNotes ... / Tests 1 failed | 4 passed (5)`. The file was restored afterwards (no diff).
3. **Wider parity guard.** `importsGraphqlClient()` rejects production imports of:
   - `queries/(notes|profile).(graphql|gql-api)` (the old check is kept);
   - `api/graphql`;
   - `graphql/(notes|profile).queries`.

   A new self-test pins which import lines it flags (7) and allows (3), so the guard cannot silently match nothing. It scans the same production roots as before.

Verification:
- `npx vitest run --root apps/templates/client-<ui>`: shadcn 15 files / 51 tests, antd 10 / 33, mui 10 / 34, all passed.
- `cd tools/create-icore && npx vitest run src/lib/__tests__/client-graphql-parity.unit.test.ts`: 24 passed (24).
- `yarn nx run-many -t lint vite:build -p client-shadcn client-antd client-mui --skip-nx-cache`: `Successfully ran targets lint, vite:build for 3 projects`, 0 errors. The one warning per template is the pre-existing `main.tsx` non-null assertion.
- `npx tsc --noEmit -p apps/templates/client-<ui>/tsconfig.spec.json`: shadcn 1/1, antd 0/0, mui 23/23 (before/after). The error lists are identical, so no new errors.
- `cmp` confirms the four renamed files are byte-identical across the three templates.
- Prettier was run on the touched files.
