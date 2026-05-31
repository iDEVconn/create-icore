---
'@idevconn/create-icore': patch
---

Move the strategy contract-test harness out of the production `@icore/shared` surface so generated projects build under any tsconfig.

The `runAuthContract` / `runStorageContract` / `runDBContract` harness used Vitest globals (`describe`/`it`/`expect`) but lived in `strategies/contract/*.ts` as ordinary source, re-exported from the prod `index.ts`. Any build or typecheck without `vitest/globals` in `types` failed with `TS2304: Cannot find name 'expect'/'it'` — `nx build shared` only passed because its `tsconfig.lib.json` injected `vitest/globals`, a fragile hack.

- Harness moved to `strategies/__tests__/*.contract.unit.test.ts` (project test-naming convention) → excluded from the library build like any test file; the `vitest/globals` hack is removed from `tsconfig.lib.json`.
- It is no longer exported from the prod `index.ts`; tests import it from a new `@icore/shared/testing` subpath (mirrors `@icore/shared/client`).
- Vitest is configured not to run the pure-harness files (they only export suites, no top-level tests); the concrete `fake-*` and per-provider contract tests invoke them.

Result: the shipped `@icore/shared` carries zero test DSL, and the generated workspace compiles regardless of which tsconfig builds it.
