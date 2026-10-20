### Task 3: `D1DbModule`

**Files:**

- Create: `libs/db-strategies/d1/src/lib/d1-db.module.ts`
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-db.module.unit.test.ts`
- Modify: `libs/db-strategies/d1/src/index.ts`

**Interfaces:**

- Consumes: `createD1RestClient`, `D1DBStrategy`; `buildStrategyWithFallback`, `FakeDBStrategy` from `@icore/shared`.
- Produces: `const D1_DB_REQUIRED_ENV: string[]` = `['D1_ACCOUNT_ID','D1_DATABASE_ID','D1_API_TOKEN']`; `class D1DbModule { static forRoot(envPath: string): DynamicModule }` providing/exporting token `'DBStrategy'`.

- [ ] **Step 1: Write failing tests** modelled on `libs/storage-strategies/minio/src/lib/__tests__/minio-storage.module.unit.test.ts` (stub `ConfigService` module): `declares its required env`; `provides a real D1DBStrategy when env present`; `falls back to FakeDBStrategy when env is missing outside production` (assert instance is `FakeDBStrategy`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** the module following `sqlite-db.module.ts` (service label `'notes MS'`, provider `'d1'`). **Step 4: Run** — PASS. Export from `index.ts`.
- [ ] **Step 5: Quality gate**: `npx prettier --write libs/db-strategies/d1`, `yarn nx lint db-d1`, `yarn nx build db-d1`. **Step 6: Commit** `feat(db-d1): D1DbModule`.

