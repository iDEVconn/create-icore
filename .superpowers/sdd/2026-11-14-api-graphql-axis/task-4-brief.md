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

