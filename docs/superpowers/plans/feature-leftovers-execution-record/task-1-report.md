# Task 1 Report: `nx migrate` 22.7.6 -> 23.0.1

## What was implemented

Ran the full `nx migrate` workflow per the brief:

1. `yarn nx migrate 23.0.1` — bumped `nx`/`@nx/*` in `package.json` to `23.0.1` and generated `migrations.json` (30 entries) plus a new `tools/ai-migrations/` directory containing 3 "AI migration prompt" markdown files (a new Nx 23 feature — see "Deviation from brief" below).
2. `yarn install` — exit 0, lockfile updated. (Only pre-existing `YN0002` peer-dependency warnings, no new ones.)
3. Inspected `migrations.json` — none of the 30 entries touch `apps/api/project.json` or `apps/microservices/*/project.json`. Two entries rewrite `NxTsconfigPathsWebpackPlugin`/`NxReactWebpackPlugin` imports — grepped the repo, no such imports exist, so those are no-ops.
4. `yarn nx migrate --run-migrations` — exit 0. 27 migrations applied, 3 deferred as "AI migration prompts" (Vite 8, Vitest 3, Vitest 4 breaking-change guides — gated behind `vite>=8`/`vitest>=3`/`vitest>=4`, which this workspace satisfies: `vite@^8.1.0`, `vitest@~4.1.9`).

   Real changes produced by the 27 applied migrations:
   - `nx.json`: `testTargetName` moved out of the `@nx/vite/plugin` options block into a new dedicated `@nx/vitest` plugin entry (matches the `ensure-vitest-package-migration-23` migration's stated purpose).
   - `vitest.workspace.ts` deleted, `vitest.config.ts` created with the project globs inlined into `test.projects` (matches `migrate-to-vitest-4`'s described pre-pass behavior — verified the content is a faithful 1:1 translation of the old workspace file).
   - `.gitignore`: added `.nx/migrate-runs`.
   - `package.json`/`yarn.lock`: `webpack-cli` bumped `^5.1.4` -> `7.2.1`, `webpack` and `webpack-dev-server` added as explicit devDependencies (`5.108.4` / `5.2.6`).

## Deviation from the brief (and why)

The brief expected `migrations.json` to be deleted automatically on success. In Nx 23, when applicable migrations have no fully-automatable codemod, `nx migrate --run-migrations` **defers** them as "AI migration prompt" files under `tools/ai-migrations/` and does **not** delete `migrations.json`, expecting an AI agent driving the run to read the prompts, apply any needed changes, and clean up afterward. This wasn't anticipated by the brief.

I treated this as an "unclear/unexpected" situation per the task instructions and did due diligence rather than guessing:

- Read all 3 deferred prompt files in full (Vite 8 migration guide, Vitest 3 migration guide, Vitest 4 migration guide).
- Grepped the entire repo (excluding `node_modules`/`.nx/cache`) for every breaking-change pattern each guide calls out: `rollupOptions`, `poolOptions`, `watchExclude`, `--segfault-retry`, `browser.provider`/`browser.name`/`browser.indexScripts`, `@vitest/coverage-c8`, `SpyInstance`, `.mock.results`, two-generic `vi.fn<...>`, imports from `vitest/reporters`/`resolveConfig`, `defineWorkspace`, Cypress usage, and `@vitejs/plugin-react` babel options.
- Zero matches for every pattern. Confirmed the repo genuinely has nothing for these guides to act on — this is a scaffold with plain vitest/vite configs, no browser-mode testing, no custom reporters, no Cypress.
- Deleted `migrations.json` and `tools/ai-migrations/` after confirming no follow-up code changes were needed, restoring the outcome the brief expected (migrations.json gone, no manual code changes beyond what the automated codemods already did).

This is documented in the commit message. If a future `nx migrate` run surfaces deferred prompts that DO match repo patterns, they'll need actual code changes — this workspace just happened to have none of the affected constructs.

## Unrelated drift discovered and reverted (not committed)

Running `yarn nx run-many -t build` triggers `create-icore:build`, which depends on a `snapshot-templates` target (`tools/create-icore/scripts/snapshot-templates.mjs`) that re-syncs `tools/create-icore/templates/` from the live `libs/`/`apps/` source tree. This surfaced two pre-existing, unrelated diffs in the working tree that have nothing to do with the nx migration:

1. `tools/create-icore/templates/.husky/pre-commit` — the snapshot script copies the repo's own root `.husky/pre-commit` (which correctly uses `yarn` for this repo) verbatim into the template, which **regresses** the intentional PM-agnostic fix from commit `d37b52b` ("husky uses npx for PM-agnostic hooks"). The snapshot script has no substitution step for this.
2. `tools/create-icore/templates/libs/auth-strategies/postgres/src/lib/__tests__/postgres-auth.module.unit.test.ts` — the template copy was stale relative to the real source file (missing a test case that already exists in `libs/auth-strategies/postgres/...`); syncing picked it up.

Neither is a migration side effect — they're a pre-existing bug in `snapshot-templates.mjs` (no yarn->npx substitution for the husky template) and stale-template drift, both orthogonal to Task 1. I reverted both (`git checkout --`) so they don't contaminate this commit. Flagging here since `docs/superpowers/plans/2026-07-05-scaffold-generator-gaps.md` (untracked, already present in the repo before I started) appears to be tracking exactly this class of scaffold-generator drift — worth a look for whoever owns that plan.

## Testing / verification

`yarn nx run-many -t lint test build` (39 projects + 1 dependency task):

- **Failed (5, all the same known cause):** `auth:build`, `notes:build`, `payment:build`, `jobs:build`, `upload:build` — all fail identically with `webpack-cli build --node-env=production` → `Error: Unknown option '--node-env=production'`. This is Task 2's bug surfacing, exactly as anticipated by the brief.

  **Note:** the brief named only `apps/microservices/{auth,notes,upload}` as expected to break. In practice **5** microservices use the `--node-env` flag in their `project.json` (`auth`, `notes`, `payment`, `jobs`, `upload`) — `payment` and `jobs` weren't named in the brief but hit the identical error. Confirmed via `grep -rn "node-env" apps/microservices/*/project.json`. Task 2 should fix all 5, not just 3.

- **Everything else green:** all lint targets passed (only pre-existing deprecation warnings for `@nx/eslint:lint`/`@nx/vitest:test`/`nxViteTsPaths`/`nxCopyAssetsPlugin`, no new errors), all test targets passed (including `create-icore`'s 168 tests, `db-postgres`, `payment`, `db-mongodb`, etc.), and `apps/api:build` (`webpack-cli build`, no `--node-env` flag) **built green** — `webpack compiled successfully`.
- No new lint errors, no new test failures beyond the 5 known `--node-env` build breaks.

## Resolved webpack-cli version (critical for Task 2)

```
"webpack": "5.108.4",
"webpack-cli": "7.2.1",
"webpack-dev-server": "5.2.6"
```

`webpack-cli` moved from `^5.1.4` to `7.2.1` — **the bug reproduces**. Task 2 needs the full version-bump-aware fix, not a skip.

## Files changed (committed)

- `package.json` — nx/@nx/* -> 23.0.1, webpack-cli -> 7.2.1, webpack/webpack-dev-server added
- `yarn.lock` — updated for the above
- `nx.json` — `testTargetName` moved from `@nx/vite/plugin` into new `@nx/vitest` plugin block
- `.gitignore` — added `.nx/migrate-runs`
- `vitest.config.ts` — created (inlines the old `vitest.workspace.ts` project globs)
- `vitest.workspace.ts` — deleted

Commit: `30ebd88` — "chore: nx migrate 22.7.6 -> 23.0.1"

## Self-review

- [x] Resolved webpack-cli version recorded: `7.2.1` (Task 2 needed).
- [x] `apps/api` build stayed green.
- [x] Did not touch `apps/microservices/{auth,notes,upload}/project.json` (nor `payment`/`jobs`, also out of scope).
- [x] Commit scoped to migration-touched files only (`package.json`, `yarn.lock`, `nx.json`, `.gitignore`, `vitest.config.ts`, `vitest.workspace.ts`). Verified with `git status --short` / `git diff` before committing — no stray files included.
- [x] Reverted unrelated `snapshot-templates.mjs` side-effect drift before committing (see above) so it doesn't get swept into this or a future commit by accident.

## Issues / concerns

1. **Nx 23's new deferred AI-migration-prompt workflow** isn't something the brief anticipated. I resolved it by verifying (via exhaustive grep) that none of the breaking-change patterns in the 3 deferred prompts apply to this codebase, then cleaned up the generated artifacts. If this project's tooling advances to Vite 8 / Vitest 3-4 territory in ways that DO hit these patterns in the future, someone will need to re-run `nx migrate` fresh (not resume from a stale `migrations.json`) to get accurate prompts again.
2. **Brief undercounted affected microservices**: 5 (`auth`, `notes`, `payment`, `jobs`, `upload`), not 3. Passing this forward for Task 2's scope.
3. **Pre-existing scaffold-generator bug found but not fixed** (out of scope for Task 1): `snapshot-templates.mjs` doesn't apply the npx/yarn PM-agnostic substitution when syncing `.husky/pre-commit` into `tools/create-icore/templates/`, silently reintroducing the `d37b52b` regression on every template resync. Worth a follow-up task.
