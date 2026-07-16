# Task 7 Report: Wire `migrate` subcommand into `cli.ts`

## Working directory / branch verification

```
pwd:    /home/vladimir-tkach/Projects/22/.claude/worktrees/feature+migrate-cli
branch: feature/migrate-cli
```

Confirmed correct before any work began.

## What changed

### Step 1 — `tools/create-icore/package.json` + `tools/create-icore/eslint.config.mjs`

Moved `semver` from `devDependencies` to `dependencies` (kept the same version specifier
`^7.8.1`, unchanged) since it's now genuinely reachable at runtime from the published `cli`
entry via the new `migrate-cli.ts`. Removed `'semver'` from the `ignoredDependencies` array
in `eslint.config.mjs`'s `@nx/dependency-checks` rule (no longer build-tooling-only, so no
allowlist entry needed — same treatment as `@clack/prompts`/`kleur`).

Ran `yarn install`: exit 0. `yarn.lock` had **no diff** — Yarn merges a workspace package's
`dependencies` + `devDependencies` into a single alphabetized `dependencies:` block in the
lockfile entry for that package, so moving `semver` between the two `package.json` sections
with an unchanged specifier produces identical lockfile content. This differs from the
brief's expectation of "content changes" but is the correct, verified Yarn behavior — nothing
to stage for `yarn.lock`.

Ran `yarn nx lint create-icore`: `✔ All files pass linting` — 0 errors, confirming the
allowlist removal didn't reintroduce a dependency-checks violation.

### Step 2 — Created `tools/create-icore/src/migrate/migrate-cli.ts`

New module exporting `runMigrateCli(argv: string[], projectDir = process.cwd()): Promise<void>`,
exactly per the brief:

- `parseMigrateFlags` — parses `--to=<version>` (with `--continue` documented as a no-op flag
  kept only for expectation parity with `nx migrate --continue`; progress is derived from git
  history, not stored).
- `highestVersion` — reduces `registry.entries` to the max `semver`-compared version, defaulting
  to `'0.0.0'` for an empty registry.
- `loadRegistry` — reads `migrations/registry.json` from `resolvePackageRoot()` (Task 4).
- `printAiPromptInstructions` — logs an `ai-prompt` entry's id/description/diff and commit
  instructions via `@clack/prompts`.
- `runMigrateCli` — reads `blueprint.json` from `projectDir` (throwing a clear "is this a
  create-icore-scaffolded project?" error on failure), loads the registry, computes
  `currentVersion`/`targetVersion`, builds `projectAxes` from all 8 blueprint axes
  (`authProvider`, `dbProvider`, `upload`, `payment`, `jobs`, `example`, `ui`, `transport`),
  calls `computePlan` (Task 1) → `createMigrateDeps` (Task 4) → `runMigrate` (Task 3), and
  prints the appropriate `p.outro` message for `'up-to-date'` / `'paused'` / completed.

Ran `npx prettier --write` on the new file plus all touched files — prettier reflowed two
lines in `migrate-cli.ts` (line width), no semantic change.

### Step 3 — Wired subcommand branch into `tools/create-icore/src/cli.ts`

Added `import { runMigrateCli } from './migrate/migrate-cli.js';` alongside the existing
imports, and inserted at the top of `main()`:

```typescript
if (process.argv[2] === 'migrate') {
  await runMigrateCli(process.argv.slice(3));
  return;
}
```

before the existing `if (!existsSync(templatesDir))` check. The existing
`main().catch((err) => { p.log.error(...); process.exit(1); })` at the bottom of the file
already handles any error thrown by `runMigrateCli` (dirty-tree, missing `blueprint.json`) —
no new error handling added.

## Step 4 — Real end-to-end smoke test

```bash
yarn nx build create-icore
REPO_ROOT="$(pwd)"
SCRATCH=$(mktemp -d)
cd "$SCRATCH"
git init -q
git config user.email test@example.com
git config user.name Test
cat > blueprint.json <<'EOF'
{ ... generatorVersion: "0.0.0", ... }
EOF
git add -A
git commit -q -m "init"
node "$REPO_ROOT/tools/create-icore/dist/cli.js" migrate --to 99.0.0
cd "$REPO_ROOT"
rm -rf "$SCRATCH"
```

**Exact output:**

```
│
└  Already up to date.
```

**Exit code: 0.**

This is the correct, intended outcome: the bundled `registry.json` has zero entries (no real
migrations authored anywhere in the project yet), so `computePlan` returns an empty plan for
any `--to` target (even a made-up far-future `99.0.0`), and `runMigrate` short-circuits to
`'up-to-date'`. This proves the full wiring end-to-end: subcommand dispatch (`cli.ts` →
`runMigrateCli`) → registry load (`resolvePackageRoot` + `migrations/registry.json`) →
blueprint read → `computePlan` → `runMigrate` orchestration → `p.outro` output.

## Step 5 — Full test suite and lint

`yarn nx test create-icore`:

```
Test Files  26 passed (26)
     Tests  237 passed (237)
```

No regressions; includes all `src/migrate/__tests__/*` suites from Tasks 1–4 plus every
pre-existing suite.

`yarn nx lint create-icore`:

```
✔ All files pass linting
```

0 errors.

## Build side-effect / template drift check

`yarn nx build create-icore` (run for the Step 4 smoke test) runs the `build-migration-registry`
and `snapshot-templates` upstream Nx targets before `tsup`. The `snapshot-templates` step
regenerated 4 files under `tools/create-icore/templates/` (postgres auth-strategy template
files, `.env.example`) — drift unrelated to this task, a known build side-effect per project
memory. These were discarded with `git checkout -- tools/create-icore/templates/` immediately
before staging. `tools/create-icore/migrations/registry.json` was unaffected (still
`{"entries": []}`, unchanged, already tracked from Task 6).

Final `git status --short` before commit showed only the four intended files: `eslint.config.mjs`,
`package.json`, `src/cli.ts` (modified), `src/migrate/migrate-cli.ts` (new). `yarn.lock` had no
diff to stage (see Step 1 note above).

## Commit

```
5a1ed6d feat(create-icore): wire migrate subcommand into the CLI
 4 files changed, 94 insertions(+), 10 deletions(-)
```

Working tree confirmed clean after commit; branch remained `feature/migrate-cli` throughout.
