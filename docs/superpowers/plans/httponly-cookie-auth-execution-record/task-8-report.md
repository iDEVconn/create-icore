# Task 8 Report — access-token + CSRF + shared silent-refresh modules

## What I implemented

Three pure, standalone modules in `libs/template-shared/src/lib/api/`, exported from the package's public entry point. Nothing else in the repo consumes them yet (Task 9's `create-api.ts` wiring is explicitly out of scope here).

1. **`access-token.ts`** — module-level in-memory store: `getAccessToken(): string | null`, `setAccessToken(token: string | null): void`.
2. **`csrf.ts`** — `readCsrfCookie(): string | null`, reading the `icore_csrf` cookie via regex. This is the single place the regex lives; `silent-refresh.ts` imports it rather than re-implementing.
3. **`silent-refresh.ts`** — `performSilentRefresh(baseUrl): Promise<{accessToken, user} | null>`. POSTs to `${baseUrl}/auth/refresh` with `credentials: 'include'` and an `X-CSRF-Token` header sourced from `readCsrfCookie()`. Serializes the call across tabs via `navigator.locks.request('icore-auth-refresh', ...)` when the Web Locks API is available, falling back to an unguarded call otherwise. Calls `setAccessToken` itself on success.

Exported all three from `libs/template-shared/src/index.ts`, added right after the existing `./lib/api/create-api.js` export line (matching that file's actual current content, not assuming the brief's stated anchor).

## Import-style correction applied (per controller instruction)

- Source files (`access-token.ts`, `csrf.ts`, `silent-refresh.ts`) use `.js`-suffixed relative imports where they import from each other (`silent-refresh.ts` imports `./csrf.js` and `./access-token.js`), matching `create-api.ts`'s existing convention.
- Test files import without the `.js` suffix (`'../access-token'`, `'../csrf'`, `'../silent-refresh'`), matching `create-api.unit.test.ts`'s existing convention. Confirmed both conventions by reading the existing files before starting, as instructed.

## Deviations from the brief's literal snippets (both necessary, both verified safe)

1. **Test environment**: `libs/template-shared/vitest.config.mts` sets `environment: 'node'` project-wide (confirmed by reading the file). The brief's `csrf` and `silent-refresh` test snippets use `document.cookie`, which is undefined under `environment: 'node'` — first RED run for `csrf` failed with `ReferenceError: document is not defined` (not the "module doesn't exist" RED the brief expected). `jsdom` is already an installed root devDependency (`package.json` `"jsdom": "~30.1.0"`), so I added a per-file `// @vitest-environment jsdom` docblock as the first line of `csrf.unit.test.ts` and `silent-refresh.unit.test.ts` only — no change to the shared config, no effect on other tests in this project. `access-token.unit.test.ts` needs no DOM, so it was left on the default `node` environment.
2. **`csrf.ts` TS strict-mode fix**: the brief's literal `decodeURIComponent(match[1])` fails `nx build template-shared`'s TypeScript compile (`noUncheckedIndexedAccess`-driven: `match[1]` types as `string | undefined`, not assignable to `decodeURIComponent`'s `string` parameter). Fixed by binding `const value = match?.[1]` and checking truthiness before calling `decodeURIComponent(value)`. Behavior is identical; this is purely a type-narrowing change. Confirmed by rebuilding — it was the only compile error, and rerunning the full test suite + lint after the fix showed no regression.
3. **One lint warning, fixed to keep output pristine**: the brief's own `silent-refresh.unit.test.ts` snippet contains `fetchMock.mock.calls[0]!`, which trips `@typescript-eslint/no-non-null-assertion` as a warning (0 errors, 1 warning on first lint run). Since this was a warning I introduced (not pre-existing, not unrelated to my touched files), I added a scoped `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion` with a justification comment rather than leave a stray warning. Final `nx lint template-shared` run: 0 errors, 0 warnings.

## TDD evidence (RED → GREEN) per wave

### Wave 1: access-token

- RED: `yarn nx test template-shared -t "access-token"` → `Cannot find module '../access-token'` (module didn't exist yet). 1 failed suite.
- Implemented `access-token.ts`.
- GREEN: same command → `access-token.unit.test.ts (3 tests)` all passed, 4/4 total tests passing (incl. pre-existing `create-api` test).

### Wave 2: csrf

- RED (1st attempt): `yarn nx test template-shared -t "readCsrfCookie"` → `Cannot find module '../csrf'`. 1 failed suite.
- Implemented `csrf.ts` per brief.
- Re-ran → 2 tests FAILED with `ReferenceError: document is not defined` (see deviation #1 above — the file resolved, but `document` isn't defined under the `node` test environment). Added `// @vitest-environment jsdom` to the test file.
- GREEN: `yarn nx test template-shared -t "readCsrfCookie"` → `csrf.unit.test.ts (2 tests)` passed, 6/6 total.

### Wave 3: silent-refresh

- RED: `yarn nx test template-shared -t "performSilentRefresh"` → `Failed to resolve import "../silent-refresh"`. 1 failed suite (test file already had the `@vitest-environment jsdom` docblock from the start this time, based on the csrf lesson).
- Implemented `silent-refresh.ts` per brief.
- GREEN: `yarn nx test template-shared -t "performSilentRefresh"` → `silent-refresh.unit.test.ts (4 tests)` passed, 10/10 total. All 4 test cases pass, including "serializes two concurrent calls through navigator.locks when available" (`lockRequest` called exactly twice).

### Final full-suite run

`yarn nx test template-shared`:

```
✓ src/lib/api/__tests__/access-token.unit.test.ts (3 tests)
✓ src/lib/api/__tests__/create-api.unit.test.ts (1 test)
✓ src/lib/api/__tests__/csrf.unit.test.ts (2 tests)
✓ src/lib/api/__tests__/silent-refresh.unit.test.ts (4 tests)

Test Files  4 passed (4)
     Tests  10 passed (10)
```

## Step 14: `@idevconn/api-client` pin verification

```
$ grep '"@idevconn/api-client"' package.json libs/template-shared/package.json
package.json:    "@idevconn/api-client": "^0.3.3",
libs/template-shared/package.json:    "@idevconn/api-client": "^0.3.3",
```

Both already at `^0.3.3` — no bump needed, no-op confirmed as expected.

Note: I did **not** touch Task 8b (`tools/create-icore/_template-shell/package.json` bump) — the controller's job list for this dispatch (steps 1–8) covers Task 8 only, not Task 8b.

## Post-coding routine

```
$ npx prettier --write <7 touched files>          # all "(unchanged)" except silent-refresh test (reformatted a long line), then reformatted again after the eslint-disable edit — "(unchanged)" on final run
$ yarn nx lint template-shared                     # 0 errors, 0 warnings
$ yarn nx build template-shared                     # Done compiling TypeScript files for project "template-shared". (after the csrf.ts noUncheckedIndexedAccess fix)
```

## Files changed

- `libs/template-shared/src/lib/api/access-token.ts` (new)
- `libs/template-shared/src/lib/api/csrf.ts` (new)
- `libs/template-shared/src/lib/api/silent-refresh.ts` (new)
- `libs/template-shared/src/lib/api/__tests__/access-token.unit.test.ts` (new)
- `libs/template-shared/src/lib/api/__tests__/csrf.unit.test.ts` (new)
- `libs/template-shared/src/lib/api/__tests__/silent-refresh.unit.test.ts` (new)
- `libs/template-shared/src/index.ts` (modified — added 3 export lines after `./lib/api/create-api.js`)

Commit: `13837f9` — "feat(template-shared): add in-memory access-token store, CSRF cookie reader, shared silent-refresh helper" (7 files changed, 169 insertions(+))

## Self-review

- **Completeness**: all 3 modules implemented with the exact signatures specified; all test cases from the brief present, including the Web Locks serialization test (4/4 silent-refresh cases, 2/2 csrf cases, 3/3 access-token cases).
- **Quality**: matches `create-api.ts`'s `.js`-suffixed source-import convention and `create-api.unit.test.ts`'s no-suffix test-import convention. No restructuring of anything else in `libs/template-shared`.
- **Discipline**: nothing beyond the brief's scope — did not touch `create-api.ts`, did not touch Task 8b's `_template-shell` pin bump (out of scope for this dispatch), did not touch any other file.
- **Testing**: all tests verify real behavior — `access-token` tests check actual get/set/clear round-trips; `csrf` tests check actual `document.cookie` parsing (present/absent/among-other-cookies); `silent-refresh` tests mock `fetch` and assert the real request URL/credentials/header, assert `null` returns on non-ok and network failure, and assert `navigator.locks.request` is invoked exactly twice for two concurrent calls (via a stubbed `navigator` global) — none of these are trivial "function exists" assertions.
- **Output pristine**: final `nx test`, `nx lint`, `nx build` runs are all clean — 10/10 tests, 0 lint errors/warnings, successful compile. No stray warnings left in the diff.
- **Branch discipline**: worked directly on `feature/httponly-cookie-auth` as instructed (not a worktree), did not switch branches, confirmed via `git branch --show-current` before committing.

## Concerns

None blocking. Two small, in-scope corrections were required beyond the brief's literal snippets (test environment per-file override for `document` access; a `noUncheckedIndexedAccess`-driven type fix in `csrf.ts`; and an eslint-disable to silence a warning baked into the brief's own test snippet) — all three are documented above with rationale and were verified safe via full test/lint/build reruns. Task 9 (wiring these into `create-api.ts`) should have no trouble consuming these exports as specified.
