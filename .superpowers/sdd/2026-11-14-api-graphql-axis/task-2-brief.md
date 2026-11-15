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

