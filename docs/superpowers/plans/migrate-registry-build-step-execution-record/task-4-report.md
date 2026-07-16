# Task 4 Report: Real git/fs-backed `BuildRegistryDeps` (`git-deps.ts`)

## Working directory / branch verification

Confirmed at task start:

```
pwd: /home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-registry-build-step
git branch --show-current: feature/migrate-registry-build-step
```

Correct worktree and branch. Proceeded.

## What changed

1. **`tools/create-icore/package.json`** — added `@changesets/parse: ^0.4.3` and `minimatch: ^10.2.5` to `devDependencies` (verbatim per brief Step 1).
2. **`tools/create-icore/eslint.config.mjs`** — added `'minimatch'` and `'@changesets/parse'` to the `ignoredDependencies` allowlist for the `@nx/dependency-checks` rule (array now: `['tsup', 'vitest', 'js-yaml', 'semver', 'minimatch', '@changesets/parse']`).
3. **`yarn.lock`** — regenerated via `yarn install` (exit 0). Confirmed `minimatch@npm:10.2.5` and `@changesets/parse@npm:0.4.3` resolved and present in the lockfile.
4. **`tools/create-icore/src/migrations/__tests__/git-deps.unit.test.ts`** (new) — the 6-case integration test from the brief, verbatim: spins up a real temp git repo via `mkdtemp` + `git init`/`git commit`, exercises `listChangesetPairs`, `diffFiles`/`diffText` (glob-scoped real git diff), `codemodExists`, `currentVersion`, and `loadExistingRegistry` (both present-and-absent registry.json cases).
5. **`tools/create-icore/src/migrations/git-deps.ts`** (new) — `createGitDeps(repoRoot)` implementation, verbatim per brief: shells out to `git diff --name-only <range>` via `execFile`/`promisify`, filters by `minimatch` against caller-supplied globs, parses changeset frontmatter with `@changesets/parse`, reads `tools/create-icore/package.json` for `currentVersion()`, and reads/parses `tools/create-icore/migrations/registry.json` (or returns `{ entries: [] }` on ENOENT) for `loadExistingRegistry()`. Imports `BuildRegistryDeps`, `ChangesetPair`, `ChangesetRelease`, `RegistryFile` from Task 3's `./build-registry.js` — no redefinition.

Ran `npx prettier --write` on all touched files; only whitespace/line-wrap changes were applied (the eslint config array was reflowed to multi-line, and one test line was wrapped) — no functional changes, re-verified tests + lint still green afterward.

## TDD sequence followed exactly

- **Step 3 (expect fail):** `yarn nx test create-icore -t "createGitDeps"` before creating `git-deps.ts` → failed with `Error: Cannot find module '../git-deps.js'` exactly as the brief predicted (20 passed suites / 210 tests passed, 1 suite failed to even load).
- **Step 5 (expect pass):** after creating `git-deps.ts`, re-ran the same filtered test → `src/migrations/__tests__/git-deps.unit.test.ts (6 tests)` all green. Full suite: `Test Files 21 passed (21)`, `Tests 216 passed (216)`.

## Verification commands run (final)

- `yarn install` → exit 0, `yarn.lock` updated (only pre-existing unrelated peer-dependency warnings, no new ones from `minimatch`/`@changesets/parse`).
- `yarn nx lint create-icore` → `✔ All files pass linting`, 0 errors (run twice: once right after Step 1's eslint allowlist edit, once again after the full implementation + prettier pass).
- `yarn nx test create-icore -t "createGitDeps"` → 6/6 new tests pass.
- `yarn nx test create-icore` (full suite, no filter) → 21 test files / 216 tests, all passing.
- `yarn nx run create-icore:typecheck` → success, no errors.
- `yarn nx build create-icore` → success (`dist/index.js`, `dist/index.cjs`, `dist/cli.js`, `dist/manifest/audit.js`, `.d.ts` all emitted). Confirms `src/migrations/**` (including the new `git-deps.ts`) is correctly excluded from `tsup` entries, consistent with the brief's rationale for why `minimatch`/`@changesets/parse` are dev-only and end-user-safe to allowlist.

## Deviations from the brief

None. All file contents (test file and `git-deps.ts`) were used verbatim from the brief as instructed. The only non-substantive change was prettier's automatic reflow of the eslint array to multi-line and a line-wrap in the test file — both purely cosmetic, re-verified with tests/lint after.

## Template drift check (per project memory)

`yarn nx build create-icore` regenerates `tools/create-icore/templates/**` from the current template sources. This build (run as part of the post-coding routine) produced unrelated drift in 4 template files (`.env.example`, postgres auth strategy files) that belong to already-merged work from a different branch/PR, not to this task. Discarded via `git checkout -- tools/create-icore/templates/` before staging, per the "check template drift before commit" project memory note. Confirmed `git status --short` was clean of template changes before `git add`.

## Self-review findings

- Confirmed `git-deps.ts` imports types (`BuildRegistryDeps`, `ChangesetPair`, `ChangesetRelease`, `RegistryFile`) from `./build-registry.js` rather than redefining them, per the task context note.
- Confirmed the `ignoredDependencies` allowlist change is scoped to `tools/create-icore/eslint.config.mjs` only (not the root eslint config), matching how `js-yaml`/`semver` were handled in Tasks 2/3.
- Confirmed no other files were touched — `git status --short` was empty after the commit.
- `createGitDeps` is async-returning-an-object-literal (not a class) — matches the shape of `BuildRegistryDeps` interface directly, consistent with the pure/fake implementations from Task 3 (not verified byte-for-byte against Task 3's fake, but the interface shape lines up per `build-registry.ts`).
- No `TODO`/stub logic left in the new file; all six `BuildRegistryDeps` methods are fully implemented per the brief.

## Commit

`99fd3ce` — `feat(create-icore): add real git/fs-backed BuildRegistryDeps`

5 files changed: `tools/create-icore/eslint.config.mjs`, `tools/create-icore/package.json`, `tools/create-icore/src/migrations/__tests__/git-deps.unit.test.ts` (new), `tools/create-icore/src/migrations/git-deps.ts` (new), `yarn.lock`.
