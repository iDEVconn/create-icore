# Task 4 Report: `migrate-deps.ts` — real `CodemodDeps` implementation

## Summary

Implemented the real git/fs-backed `CodemodDeps` for the migrate subcommand, following TDD exactly as laid out in the brief. All 5 test cases pass; no deviations from brief.

## Changes Made

**Files Created:**
- `tools/create-icore/src/migrate/migrate-deps.ts`
- `tools/create-icore/src/migrate/__tests__/migrate-deps.unit.test.ts`

**Implementation Details:**

`migrate-deps.ts` exports:
1. **`resolvePackageRoot()`**: Walks up from this module's own `import.meta.url` location, checking two candidates (`../` for bundled `dist/cli.js` form, `../../` for source-under-Vitest form) and returning the first that contains a `package.json`. Throws if neither candidate resolves.
2. **`createMigrateDeps(opts?: { packageRoot?: string })`**: Returns a `CodemodDeps` object (type imported from `./run.js`, not redefined):
   - `isApplied` — re-exported directly from `./state.js` (Task 2's implementation), not reimplemented.
   - `isTreeClean(projectDir)` — `git status --porcelain`, clean iff stdout is empty after trim.
   - `commit(projectDir, message)` — `git add -A` then `git commit -m <message>`.
   - `loadCodemod(id)` — dynamic `import()` of `dist/migrations/codemods/<id>.js` under the resolved `packageRoot`, converted to a `file://` URL via `pathToFileURL`; returns the module's `default` export.
   - `bumpGeneratorVersion(projectDir, targetVersion)` — reads `blueprint.json` (typed as `BlueprintJson` from `../manifest/blueprint.js`), sets `generatorVersion`, rewrites the file, then commits with the exact message `migrate: bump generatorVersion to <targetVersion>`.

Every test in `createMigrateDeps` passes an explicit `{ packageRoot: <tempDir> }` override so no test depends on the real repo's `dist/` directory. The one exception is the dedicated `resolvePackageRoot` test, which calls it with no override to prove the source-form candidate (`../..` from `src/migrate/migrate-deps.ts` under Vitest) resolves to the `create-icore` package root.

## Test Results

```
 RUN  v4.1.9 /home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-cli/tools/create-icore
 ✓ |create-icore| src/migrate/__tests__/migrate-deps.unit.test.ts (5 tests) 341ms

Test Files  25 passed (25)
     Tests  236 passed (236)
```

Step 2 (pre-implementation) run confirmed the expected failure exactly: `Error: Cannot find module '../migrate-deps.js' imported from .../migrate-deps.unit.test.ts`.

All 5 test cases pass after implementation:
1. `resolvePackageRoot` resolves to the `create-icore` package root from source form ✓
2. `isTreeClean` reflects real git status (clean → dirty transition) ✓
3. `commit` stages and commits with the exact message, tree clean afterward ✓
4. `bumpGeneratorVersion` rewrites `blueprint.json` and commits with the exact message ✓
5. `loadCodemod` imports a real compiled codemod file (dynamic `import()` via `file://` URL) and its default export runs correctly ✓

Full project suite: 236/236 passing (no regressions in the other 24 test files).

## Post-Coding Checks

- Prettier: checked — both new files already formatted correctly (`npx prettier --check` then `--write`, no changes).
- ESLint (`nx lint create-icore`): all files pass linting, 0 errors.
- Build (`nx build create-icore`): green — ESM, CJS, DTS all built successfully.
- Template drift: build produced the usual side-effect diffs under `tools/create-icore/templates/` (4 files: `.env.example`, postgres auth-strategy `package.json`/`.ts` files) — discarded via `git checkout -- tools/create-icore/templates/` before staging, per the "check template drift before commit" house rule. Only the two new migrate-deps files remained staged.
- Pre-commit hook: ran normally on commit (see below), no bypass used.

## Deviations

None. Implementation matches the brief verbatim — same file contents, same test contents, same commit message.

## Self-Review Findings

- Confirmed `CodemodDeps` type is imported (not redefined) from `./run.ts`, matching Task 3's interface exactly (`loadCodemod`, `isApplied`, `commit`, `isTreeClean`, `bumpGeneratorVersion`).
- Confirmed `isApplied` is imported and reused directly from `./state.ts` (Task 2) rather than reimplemented — the returned object's `isApplied` property is the imported function itself.
- Confirmed `BlueprintJson` is imported from `../manifest/blueprint.js` (an already-merged, unrelated prior module) rather than redefined.
- `loadCodemod`'s dynamic `import()` uses `pathToFileURL(...).href` so it works cross-platform and resolves correctly regardless of the current working directory.
- No lingering `.only`/`.skip` in the test file; all 5 `it(...)` blocks run.
- No production code depends on `resolvePackageRoot()`'s no-argument default path in this task's own tests — that path is reserved for Task 7's real CLI wiring, as called out in the task instructions.
