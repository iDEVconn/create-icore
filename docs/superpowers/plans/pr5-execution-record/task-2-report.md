# Task 2 Report: writeProvider() merges chosen provider deps into MS package.json

## Summary

Followed the brief exactly, TDD-style. `writeProvider()` in
`tools/create-icore/src/manifest/wire-provider.ts` previously only wrote the
`<axis>.provider.ts` wiring stub. It never merged the chosen provider's own
workspace alias (`@icore/<axis>-<provider>`) or raw SDK deps into the
generated microservice's `package.json`. `cleanupUnusedAxis()` only ever
*removed* the unchosen providers' keys — nothing ever *added* the chosen
one's. This revives the previously dead-code `mergeDeps(units: Unit[])` from
`assemble.ts` (written + unit-tested but never called anywhere else) by
giving it a real caller.

## What changed

- `tools/create-icore/src/manifest/wire-provider.ts`
  - Added `import { mergeDeps } from './assemble.js';`
  - `writeProvider()`: captures `unit = axis.section[provider]` (was
    previously only destructuring `.nestModule` inline), keeps the existing
    null-check-throw on `nestModule`, then after writing the provider file
    calls the new `mergeJsonDeps(join(targetDir, axis.msPackageJson), { [importFrom]: '*', ...mergeDeps([unit]) })`.
  - Added new exported `mergeJsonDeps(path, deps)`: reads the target
    package.json, merges `deps` into `pkg.dependencies` (creating the field
    if absent), writes it back. Swallows read/parse errors silently (fixture
    package.json may be absent), matching the existing `stripJsonKeys` /
    `stripTsconfigKeys` error-handling convention in the same file.

- `tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts`
  - Added the exact test case from the brief inside `describe('writeProvider')`,
    verbatim: seeds a package.json missing the `beta` provider's alias/dep
    entirely (mirroring the real `apps/microservices/auth/package.json`
    missing `@icore/auth-postgres` today), calls `writeProvider(dir, AXIS, 'beta')`,
    and asserts the merged `dependencies` now contains both the pre-existing
    `alpha` entries and the newly-merged `beta` workspace alias + raw dep.

No deviations from the brief's exact code — implementation and test are
copy-identical to the brief's Step 1 and Step 3 snippets (only reformatted by
prettier, which made no changes).

## Test commands run and results

### Step 2 — confirm the new test fails before the fix

```
npx nx test create-icore -- wire-provider.unit.test.ts
```

Result: **FAIL** (1 of 5 tests in wire-provider.unit.test.ts failed; 177/178
suite-wide passed). Failure was exactly as predicted by the brief:

```
AssertionError: expected { '@icore/x-alpha': '*', …(1) } to deeply equal { '@icore/x-alpha': '*', …(3) }
- Expected
+ Received
  {
    "@icore/x-alpha": "*",
-   "@icore/x-beta": "*",
    "sdk-alpha": "^1.0.0",
-   "sdk-beta": "^2.0.0",
  }
```

### Step 4 — confirm the new test (and pre-existing writeProvider/cleanupUnusedAxis tests) pass after the fix

```
npx nx test create-icore -- wire-provider.unit.test.ts
```

Result: **PASS** — `wire-provider.unit.test.ts (5 tests)` all green. Full
suite run alongside it: `Test Files 16 passed (16)`, `Tests 178 passed (178)`.

(Note: this project's vitest/nx test target does not actually restrict to
the named file — the `-- <file>` args pass through but the whole suite still
runs each time, as seen in the output listing all 16 test files every
invocation. This is pre-existing project behavior, not something introduced
by this change; it does not affect the validity of the pass/fail signal for
the specific files requested.)

### Step 5 — axis-specific suites (auth / storage / db), confirming no cross-axis regression

```
npx nx test create-icore -- wire-auth.unit.test.ts wire-storage.unit.test.ts wire-db.unit.test.ts
```

Result: **PASS** —
- `wire-auth.unit.test.ts`: 4 tests passed
- `wire-storage.unit.test.ts`: 2 tests passed
- `wire-db.unit.test.ts`: 3 tests passed
- Full suite alongside: `Test Files 16 passed (16)`, `Tests 178 passed (178)`

None of these axis-specific files assert the chosen provider's deps are
*absent* from the MS package.json — they only assert wiring-file content and
unchosen-provider cleanup — so the new merge behavior added nothing they
didn't expect.

### Step 6 — full create-icore suite

```
npx nx test create-icore
```

Result: **PASS** — `Test Files 16 passed (16)`, `Tests 178 passed (178)`.

### Step 7 — prettier + lint

```
npx prettier --write tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
```
Output: `Prettier: All files formatted correctly` (no changes needed — files
were already prettier-clean as written).

```
npx nx lint create-icore
```
Output: `✔ All files pass linting` — 0 errors.

## Commit

```
git add tools/create-icore/src/manifest/wire-provider.ts tools/create-icore/src/manifest/__tests__/wire-provider.unit.test.ts
git commit -m "fix(scaffold): writeProvider merges the chosen provider's own deps into the MS package.json ..."
```

Commit hash: `028edb0` on branch `bug/postgres-dep-plumbing`.

Only the two files named in the brief were staged/committed. `git status`
confirmed no other working-tree changes existed before or after.

## Deviations from the brief

None. Implementation, test code, and commit message intent all match the
brief verbatim (commit message body was expanded slightly beyond the brief's
one-line suggestion to explain the "why", per repo convention of preferring
why-focused commit messages — the subject line itself matches the brief
exactly).

## Scope confirmation

This task only modifies generator source in `tools/create-icore/src/manifest/`
— it changes how the CLI writes a *future* scaffolded project's
`package.json`, not any package.json in this repo itself. No `yarn.lock`
changes were needed or made.
