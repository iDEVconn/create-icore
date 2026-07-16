# Final whole-branch review — blocking findings fix report

Branch: `feature/migrate-cli`
Worktree: `/home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-cli`
Commit: `5e67c23` — "fix(migrate-cli): handle --to=latest and add missing changeset"

## Finding 1 (BLOCKS) — Missing changeset

Added `.changeset/migrate-cli.md`:

```markdown
---
'@idevconn/create-icore': minor
---

Add the `create-icore migrate [--to=<version>] [--continue]` CLI subcommand — consumes the `registry.json` shipped by the migration-registry pipeline (a separate, already-merged plan) to walk an already-scaffolded project through pending migrations. Mechanical fixes apply and commit automatically; fixes needing judgment print a description and the real diff, then pause for the user's own coding agent to apply and commit (marker convention: `migrate: <id>`). Progress is tracked entirely via git-log commit-message markers — no state file, so re-running the same command always resumes correctly. No real migration entries or codemods are authored yet; this ships only the mechanism.
```

(Prettier normalized the frontmatter quotes from `"..."` to `'...'` on `--write`.)

## Finding 2 (BLOCKS) — `--to=latest` crashes once a real registry entry exists

### Root cause

In `tools/create-icore/src/migrate/migrate-cli.ts`, `runMigrateCli` computed:

```ts
const targetVersion = flags.to ?? highestVersion(registry);
```

Passing `--to=latest` literally sets `flags.to = 'latest'`, which is truthy, so it bypassed `highestVersion()` and flowed straight into `computePlan`'s `semver.lte(entry.version, targetVersion)` filter — `semver.lte(x, 'latest')` throws `TypeError: Invalid Version: latest`. Invisible today only because the bundled registry ships zero entries (the filter callback never runs against an empty array).

### Fix

```ts
const targetVersion =
  flags.to === undefined || flags.to === 'latest' ? highestVersion(registry) : flags.to;
```

Now the literal string `'latest'` resolves identically to omitting `--to` altogether; any other value passes through unchanged as a real version string.

### Supporting change: injectable `packageRoot`

`runMigrateCli` had no way to point at a scratch registry for testing — `loadRegistry()` always called the module-level `resolvePackageRoot()`, and `createMigrateDeps()` was called with no override. Added an optional third parameter to `runMigrateCli(argv, projectDir, packageRoot?)`, mirroring the pattern `createMigrateDeps({ packageRoot? })` already uses. Threaded through to both `loadRegistry(packageRoot)` and `createMigrateDeps({ packageRoot })`. The one real call site (`tools/create-icore/src/cli.ts` line 26, `await runMigrateCli(process.argv.slice(3))`) needed no change since the new parameter is optional and defaults to the real `resolvePackageRoot()` behavior.

### Regression test

New file: `tools/create-icore/src/migrate/__tests__/migrate-cli.unit.test.ts`

Follows the `migrate-e2e.unit.test.ts` convention (real temp git repo as `projectDir`, real temp directory as `packageRoot` containing a real `migrations/registry.json` + `dist/migrations/codemods/<id>.js` fixture, rather than mocking). Seeds one registry entry at version `0.5.0` (`kind: 'codemod'`), calls:

```ts
await runMigrateCli(['--to=latest'], projectDir, packageRoot);
```

Asserts the call resolves without throwing and that `blueprint.json`'s `generatorVersion` ends up at `0.5.0` (the highest/only registry version) — proving `'latest'` resolved via `highestVersion(registry)` rather than being passed through to `semver.lte()` as a literal string.

## Verification

### `npx prettier --write` / `--check`

Ran on all three touched files (`migrate-cli.ts`, `migrate-cli.unit.test.ts`, `.changeset/migrate-cli.md`):

```
Prettier: All files formatted correctly
```

(on both `--write` and the follow-up `--check` pass)

### `yarn nx test create-icore`

```
 Test Files  27 passed (27)
      Tests  238 passed (238)
   Start at  20:29:54
   Duration  1.58s (transform 1.85s, setup 0ms, import 3.01s, tests 3.31s, environment 4ms)

 NX   Successfully ran target test for project create-icore
```

New test file included and passing:

```
✓ |create-icore| src/migrate/__tests__/migrate-cli.unit.test.ts (1 test) 63ms
```

### `yarn nx lint create-icore`

```
Linting "create-icore"...
✔ All files pass linting

 NX   Successfully ran target lint for project create-icore
```

## Working-directory / branch safety verification

Per the dispatch instructions (this branch had two prior incidents this session of fix-dispatch subagents committing to `dev` in the main checkout instead of this worktree):

- **Before starting:** `pwd` → `/home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-cli`; `git branch --show-current` → `feature/migrate-cli`. Confirmed correct location before any edit.
- **Commit:** made in this worktree only, on `feature/migrate-cli`, SHA `5e67c23`.
- **After finishing:** re-verified `git branch --show-current` in this worktree and checked `git status --short` in both this worktree and `/home/vladimir-tkach/Projects/22` (main checkout) — see the reply message for the literal command output confirming neither checkout has stray/unexpected state from this task.

## Files touched

- `tools/create-icore/src/migrate/migrate-cli.ts` (fix + injectable packageRoot)
- `tools/create-icore/src/migrate/__tests__/migrate-cli.unit.test.ts` (new regression test)
- `.changeset/migrate-cli.md` (new)
- `.superpowers/sdd/final-review-fix-report.md` (this report)
