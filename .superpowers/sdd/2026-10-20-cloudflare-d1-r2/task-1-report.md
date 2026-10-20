# Task 1 report: D1 lib scaffold + REST client

Status: DONE. Commit 08cd04a `feat(db-d1): D1 REST client`.

Implemented
- Lib generated with `yarn nx g @nx/js:lib --directory=libs/db-strategies/d1 --name=db-d1 --importPath=@icore/db-d1 --bundler=tsc --unitTestRunner=vitest --linter=eslint`.
- Aligned to sqlite sibling: tsconfig.json copied, package.json (deps shared/nestjs common+config/tslib), eslint config copied minus better-sqlite3; generator stubs and README removed.
- `src/lib/d1-client.ts`: D1Param, D1QueryResult, D1ClientLike, D1ApiError, D1RestClientOptions, createD1RestClient. Retries only 429/503 and non-timeout pre-response network errors, max 2, backoff 250ms*2^n or Retry-After seconds. Timeouts (AbortSignal.timeout) are NOT retried (request may have been applied); that is my interpretation of "pre-response".
- `src/index.ts` exports d1-client.

TDD
- RED: before d1-client.ts existed, `yarn nx test db-d1` -> "FAIL db-d1 src/lib/__tests__/d1-rest-client.unit.test.ts" (module missing), Failed Suites 1.
- GREEN: after implementation, 1 file, 11 tests passed (8 specified; "does not retry" parametrised over 400/401/403/500).
- `yarn nx lint db-d1` and `yarn nx build db-d1` green. Prettier run on touched files.

Files: libs/db-strategies/d1/**, tsconfig.base.json (alias), yarn.lock (workspace entry, +16). tools/create-icore/templates untouched/clean.

Concerns: none material. Pre-existing unstaged docs changes and untracked docs/live-testing-supabase-accounts.md left alone. Pre-commit hook passed.

## Fix round 1
- d1-client.ts: a body parse failure on a 2xx now throws D1ApiError (status 200); parse failure is swallowed only for non-ok responses (to build the error).
- Tests: added "rejects a 200 response with a non-JSON body"; timeout test now uses default maxRetries, asserts one fetch call, no sleep, error name TimeoutError/AbortError.
- `yarn nx test db-d1`: 1 file, 12 tests passed. Lint and build green. Prettier run.
