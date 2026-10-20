# Task 2 report: D1DBStrategy + sqlite test client

Status: DONE

## Implemented
- `libs/db-strategies/d1/src/lib/d1-db.strategy.ts`: `D1DBStrategy`, `D1_MAX_BOUND_PARAMS = 100`. Mirrors sqlite strategy; async via `D1ClientLike`; memoized `ensureTable` (CREATE TABLE and CREATE INDEX as two query calls; failed init not memoized); numeric/boolean `==`/`!=`/`in` use `CAST(json_extract AS NUMERIC)` vs `CAST(? AS NUMERIC)` (booleans -> 1/0); text and `id` plain compare; `<,<=,>,>=` keep CAST form; LIMIT validated non-negative integer and inlined; too_many_params guard before any query (list checks before ensureTable too).
- `src/lib/testing/sqlite-d1-client.ts`: `createSqliteD1Client({stringifyParams})` on `node:sqlite` loaded via `createRequire` (ruling R1, so Vite never resolves the builtin). Not exported from index.
- `src/index.ts` exports `D1DBStrategy`, `D1_MAX_BOUND_PARAMS`.
- `tsconfig.lib.json`: added `src/**/testing/**` to exclude so the build omits the test helper.

## TDD
RED: tests written first; `yarn nx test db-d1` -> "Test Files 2 failed | 1 passed (3)", "Tests 12 passed" (the 2 new files failed to import the missing modules).
GREEN: `yarn nx test db-d1` -> "Test Files 3 passed (3), Tests 54 passed (54)" (contract typed + stringified, 18 behaviour tests, Task 1 REST tests).
`yarn nx lint db-d1` green; `yarn nx build db-d1` green.

## Self-review / concerns
- Mixed-type `in` arrays: per-element CAST on right, left uncast; fine for the contract, untested beyond that.
- `<`/`>` use Number(value) param (string-param safe since CAST on left plus numeric param; in stringified mode they are sent as strings, contract passes).
- templates/ untouched (git status clean there).

## Fix round 1
Changed the too_many_params test in d1-db.strategy.unit.test.ts: spy client attached from the start, never-touched collection `fresh_collection`, no prior set/mockClear; asserts rejection with too_many_params and zero client queries.
Mutation check: moved the guard in `list` after `ensureTable` -> test FAILED (1 failed, 53 passed); restored -> `yarn nx test db-d1` 54 passed. Lint and build green.
