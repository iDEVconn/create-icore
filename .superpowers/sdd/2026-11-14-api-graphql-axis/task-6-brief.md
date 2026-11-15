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

