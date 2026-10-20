### Task 2: `D1DBStrategy` + sqlite-backed test client + contract

**Files:**

- Create: `libs/db-strategies/d1/src/lib/d1-db.strategy.ts`
- Create: `libs/db-strategies/d1/src/lib/testing/sqlite-d1-client.ts` (NOT exported from `index.ts`)
- Test: `libs/db-strategies/d1/src/lib/__tests__/d1-db.contract.unit.test.ts`, `d1-db.strategy.unit.test.ts`
- Modify: `libs/db-strategies/d1/src/index.ts`

**Interfaces:**

- Consumes: `D1ClientLike`, `D1Param` (Task 1); `DBStrategy`, `DBDocument`, `QueryOptions` from `@icore/shared`.
- Produces: `const D1_MAX_BOUND_PARAMS = 100`; `class D1DBStrategy implements DBStrategy { constructor(client: D1ClientLike) }`; `function createSqliteD1Client(opts?: { stringifyParams?: boolean }): D1ClientLike` (in-memory `node:sqlite`; when `stringifyParams` is true every non-null param is passed as `String(p)`; SELECTs return `rows`, writes return `changes`).

- [ ] **Step 1: Write failing contract test**: `runDBContract('D1DBStrategy (typed params)', () => new D1DBStrategy(createSqliteD1Client()))` and the same with `{ stringifyParams: true }` (name `'D1DBStrategy (stringified params)'`), importing `runDBContract` from `@icore/shared/testing`.
- [ ] **Step 2: Write failing behaviour tests** in `d1-db.strategy.unit.test.ts` (use the typed and stringified clients): `where == true matches stored boolean`; `where == 30 matches stored number`; `where != 30 excludes stored number`; `where in [1,2] matches numbers`; `where in [ 'a','b' ] matches text`; `list with 101 in-values rejects with too_many_params and issues no query` (spy client); `update on a missing id rejects with not_found: users/nope`; `delete on a missing id rejects with not_found`; `rejects an invalid collection name`; `rejects an invalid where field name`; `limit is inlined as a validated integer (limit -1 or 1.5 rejects)`.
- [ ] **Step 3: Run** `yarn nx test db-d1` — FAIL.
- [ ] **Step 4: Implement `D1DBStrategy`** in `d1-db.strategy.ts`, mirroring `libs/db-strategies/sqlite/src/lib/sqlite-db.strategy.ts` method for method (same table shape `id TEXT PRIMARY KEY, data TEXT NOT NULL`, memoized `ensureTable` issuing the CREATE TABLE and CREATE INDEX as two `query` calls, `json_patch` update, `not_found:` errors from `changes === 0`, identifier validation). Differences: all calls are async through `D1ClientLike`; one private function normalises a `WhereClause` into SQL + params per the Global Constraints (numeric/boolean `==`/`!=`/`in` → `CAST(json_extract(...) AS NUMERIC)` vs `CAST(? AS NUMERIC)`; text keeps plain `=`; `<`/`<=`/`>`/`>=` keep the sqlite strategy's CAST form); a guard throws `Error('too_many_params: …')` when the final params exceed `D1_MAX_BOUND_PARAMS`. Implement `createSqliteD1Client` with `node:sqlite` `DatabaseSync(':memory:')`.
- [ ] **Step 5: Run** `yarn nx test db-d1` — PASS (both contract modes). Export `D1DBStrategy`, `D1_MAX_BOUND_PARAMS` from `src/index.ts`.
- [ ] **Step 6: Commit** `feat(db-d1): D1DBStrategy with sqlite-backed contract tests`.

